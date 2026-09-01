"""Tests for onboarding document upload and download.

Damage if these break:
  upload validation -> an executable or oversized file lands on the server
  upload access     -> a stranger attaches documents to someone else's application
  download access   -> a reviewer reads files belonging to another tenant
  path handling     -> a filename escapes the application's own upload folder
"""
import uuid

import pytest

from app.core.config import settings
from tests.factories import OnboardingApplicationFactory, UserFactory
from tests.utils import API, auth_header

pytestmark = pytest.mark.integration

APPLICATIONS = f"{API}/onboarding/applications"

PDF_BYTES = b"%PDF-1.4 fake test document"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    """Redirect uploads away from the real data/uploads tree."""
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
async def applicant(db, tenant):
    return await UserFactory.create(db, tenant=tenant, is_active=False, name="Jane Doe")


@pytest.fixture
async def application(db, applicant):
    return await OnboardingApplicationFactory.create(db, user=applicant)


def pdf(filename="id.pdf", content_type="application/pdf", content=PDF_BYTES):
    return {"file": (filename, content, content_type)}


class TestUploadDocument:
    async def test_owner_can_upload_their_own_document(
        self, authenticate, applicant, application, uploads_dir
    ):
        response = await authenticate(applicant).post(
            f"{APPLICATIONS}/{application.id}/document", files=pdf()
        )

        assert response.status_code == 204
        saved = uploads_dir / str(application.id) / "id.pdf"
        assert saved.read_bytes() == PDF_BYTES

    async def test_reviewer_in_the_same_tenant_can_upload(
        self, tenant_admin_client, application, uploads_dir
    ):
        response = await tenant_admin_client.post(
            f"{APPLICATIONS}/{application.id}/document", files=pdf()
        )

        assert response.status_code == 204

    async def test_leaves_no_partial_file_behind(
        self, authenticate, applicant, application, uploads_dir
    ):
        await authenticate(applicant).post(
            f"{APPLICATIONS}/{application.id}/document", files=pdf()
        )

        leftovers = list((uploads_dir / str(application.id)).glob("*.part"))
        assert leftovers == []

    async def test_rejects_an_uploader_from_another_tenant(
        self, other_tenant_client, application, uploads_dir
    ):
        response = await other_tenant_client.post(
            f"{APPLICATIONS}/{application.id}/document", files=pdf()
        )

        assert response.status_code == 403
        assert not (uploads_dir / str(application.id)).exists()

    async def test_returns_404_for_an_unknown_application(self, tenant_admin_client):
        response = await tenant_admin_client.post(
            f"{APPLICATIONS}/{uuid.uuid4()}/document", files=pdf()
        )

        assert response.status_code == 404

    @pytest.mark.parametrize(
        "filename,content_type,reason",
        [
            ("payload.exe", "application/pdf", "extension not allowed"),
            ("script.sh", "application/pdf", "extension not allowed"),
            ("id.pdf", "application/x-msdownload", "content type not allowed"),
            ("id.pdf", "image/png", "extension and content type disagree"),
            ("photo.png", "application/pdf", "extension and content type disagree"),
        ],
    )
    async def test_rejects_disallowed_uploads(
        self, authenticate, applicant, application, uploads_dir, filename, content_type, reason
    ):
        response = await authenticate(applicant).post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(filename=filename, content_type=content_type),
        )

        assert response.status_code == 400, reason
        assert not (uploads_dir / str(application.id)).exists()

    async def test_accepts_a_heic_photo_declared_as_heif(
        self, authenticate, applicant, application, uploads_dir
    ):
        """iPhone uploads arrive with either content type; both are valid for .heic."""
        response = await authenticate(applicant).post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(filename="id.heic", content_type="image/heif"),
        )

        assert response.status_code == 204

    async def test_rejects_a_file_over_the_10mb_limit(
        self, authenticate, applicant, application, uploads_dir
    ):
        oversized = b"x" * (10 * 1024 * 1024 + 1)

        response = await authenticate(applicant).post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(content=oversized),
        )

        assert response.status_code == 413
        assert list((uploads_dir / str(application.id)).glob("*")) == []

    async def test_strips_directory_parts_from_the_uploaded_filename(
        self, authenticate, applicant, application, uploads_dir
    ):
        """A crafted filename must not write outside the application's folder."""
        response = await authenticate(applicant).post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(filename="../../escaped.pdf"),
        )

        assert response.status_code == 204
        assert (uploads_dir / str(application.id) / "escaped.pdf").exists()
        assert not (uploads_dir / "escaped.pdf").exists()
        assert not (uploads_dir.parent / "escaped.pdf").exists()


class TestDownloadDocument:
    async def test_reviewer_can_download_an_uploaded_document(
        self, tenant_admin_client, applicant, application
    ):
        await tenant_admin_client.post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(),
            headers=auth_header(applicant),
        )

        response = await tenant_admin_client.get(
            f"{APPLICATIONS}/{application.id}/document", params={"name": "id.pdf"}
        )

        assert response.status_code == 200
        assert response.content == PDF_BYTES

    async def test_returns_404_when_no_such_document_exists(
        self, tenant_admin_client, application
    ):
        response = await tenant_admin_client.get(
            f"{APPLICATIONS}/{application.id}/document", params={"name": "missing.pdf"}
        )

        assert response.status_code == 404

    async def test_returns_404_for_an_unknown_application(self, tenant_admin_client):
        response = await tenant_admin_client.get(
            f"{APPLICATIONS}/{uuid.uuid4()}/document", params={"name": "id.pdf"}
        )

        assert response.status_code == 404

    async def test_rejects_a_reviewer_from_another_tenant(
        self, other_tenant_client, applicant, application
    ):
        await other_tenant_client.post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(),
            headers=auth_header(applicant),
        )

        response = await other_tenant_client.get(
            f"{APPLICATIONS}/{application.id}/document", params={"name": "id.pdf"}
        )

        assert response.status_code == 403

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY: download_application_document builds its path with "
        "os.path.join(uploads_dir, application_id, name) and never checks that the "
        "result stays inside the application folder, so `name` can traverse out "
        "(CWE-22). Remove this marker once the endpoint is fixed.",
    )
    async def test_a_traversing_name_cannot_read_files_outside_the_upload_folder(
        self, tenant_admin_client, applicant, application, uploads_dir
    ):
        # Upload first so the application folder exists; otherwise the traversal
        # fails on a missing directory and the test would pass for the wrong reason.
        await tenant_admin_client.post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(),
            headers=auth_header(applicant),
        )
        secret = uploads_dir.parent / "secret.txt"
        secret.write_bytes(b"SERVER SECRET")

        response = await tenant_admin_client.get(
            f"{APPLICATIONS}/{application.id}/document",
            params={"name": f"../../{secret.name}"},
        )

        assert response.status_code == 404
        assert b"SERVER SECRET" not in response.content

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY: download_application_document builds its path with "
        "os.path.join(uploads_dir, application_id, name) and never checks that the "
        "result stays inside the application folder, so `name` can traverse out "
        "(CWE-22). Remove this marker once the endpoint is fixed.",
    )
    async def test_a_traversing_name_cannot_read_another_applications_document(
        self, db, tenant_admin_client, applicant, other_tenant, application, uploads_dir
    ):
        stranger = await UserFactory.create(db, tenant=other_tenant, is_active=False)
        other_application = await OnboardingApplicationFactory.create(db, user=stranger)
        await tenant_admin_client.post(
            f"{APPLICATIONS}/{other_application.id}/document",
            files=pdf(filename="private.pdf"),
            headers=auth_header(stranger),
        )
        # The reviewer's own application folder must exist for the traversal to
        # be a genuine test of path handling rather than of a missing directory.
        await tenant_admin_client.post(
            f"{APPLICATIONS}/{application.id}/document",
            files=pdf(),
            headers=auth_header(applicant),
        )

        response = await tenant_admin_client.get(
            f"{APPLICATIONS}/{application.id}/document",
            params={"name": f"../{other_application.id}/private.pdf"},
        )

        assert response.status_code == 404
        assert response.content != PDF_BYTES
