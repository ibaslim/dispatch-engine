from datetime import datetime, timezone
from app.core.deps import CurrentUserAllowInactive, TenantAdmin, get_db, _get_current_user_allow_inactive
from fastapi import APIRouter,Depends, File, HTTPException, UploadFile, status
from pathlib import Path
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, UploadFile, File
from fastapi.responses import FileResponse
import os
from app.core.config import settings
from app.models.onboarding_application import ApplicationStatus, OnboardingApplication
from app.models.location import (
    DEFAULT_DRIVER_BASE_SALARY,
    DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
    DriverPricing,
)
from app.models.tenant import Tenant
from app.models.user import RoleEnum, User, UserRole
from app.schemas.onboarding import (
    OnboardingApplicationCreateRequest,
    OnboardingApplicationResponse,
    OnboardingApplicationReviewRequest,
)
from app.workers.tasks import (
    send_onboarding_submitted_email,
    send_onboarding_approved_email,
    send_onboarding_rejected_email,
)

router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
CHUNK_SIZE = 1024 * 1024  # 1 MB

ALLOWED_CONTENT_TYPES = {
    # Documents
    "application/pdf": ".pdf",
    # Common images
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    # iPhone / modern mobile uploads
    "image/heic": ".heic",
    "image/heif": ".heif",
    # Scanned document images
    "image/tiff": ".tiff",
}

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
    ".tif",
    ".tiff",
}

EXTENSION_CONTENT_TYPE_MAP = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".heic": {"image/heic", "image/heif"},
    ".heif": {"image/heif", "image/heic"},
    ".tif": {"image/tiff"},
    ".tiff": {"image/tiff"},
}


def _to_response(application: OnboardingApplication) -> OnboardingApplicationResponse:
    return OnboardingApplicationResponse(
        id=str(application.id),
        user_id=str(application.user_id),
        tenant_id=str(application.user.tenant_id) if application.user and application.user.tenant_id else None,
        role=application.role,
        status=ApplicationStatus(application.status),
        data=application.data,
        created_at=application.created_at,
        reviewed_at=application.reviewed_at,
        reviewed_by_id=str(application.reviewed_by_id) if application.reviewed_by_id else None,
        decision_reason=application.decision_reason,
    )


def _slugify(value: str) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug


def _extract_tenant_payload(data: dict, fallback_name: str, fallback_email: str) -> dict:
    phone = data.get("phone") if isinstance(data.get("phone"), dict) else {}
    business_number = (data.get("businessNumber") or data.get("ntnNumber") or "").strip()
    return {
        "contact_name": (data.get("fullName") or fallback_name or "").strip() or None,
        "contact_email": (data.get("email") or fallback_email or "").strip() or None,
        "contact_phone_country_code": (phone.get("countryCode") or "").strip() or None,
        "contact_phone_number": (phone.get("number") or "").strip() or None,
        "address": (data.get("address") or "").strip() or None,
        "ntn_number": business_number or None,
        "notes": (data.get("notes") or "").strip() or None,
        "national_id_file_name": (data.get("nationalIdFileName") or "").strip() or None,
    }


async def _ensure_tenant_for_application(
    db: AsyncSession,
    application: OnboardingApplication,
) -> Tenant:
    """Create or update a tenant for a vendor/driver/individual onboarding application."""

    if application.role not in {RoleEnum.vendor.value, RoleEnum.driver.value, RoleEnum.individual.value}:
        raise ValueError(f"Invalid role for tenant creation: {application.role}")

    payload = _extract_tenant_payload(application.data or {}, "", "")

    # Check if a tenant already exists for this application
    existing_result = await db.execute(
        select(Tenant)
        .where(Tenant.id.isnot(None))  # Placeholder query to check for existing tenants
    )

    # Build tenant name from contact_name or email
    tenant_name = payload.get("contact_name") or payload.get("contact_email") or f"{application.role.title()} Tenant"
    base_slug = _slugify(tenant_name) or application.role

    # Generate unique slug
    candidate = base_slug
    suffix = 1
    while True:
        existing = await db.execute(select(Tenant).where(Tenant.slug == candidate))
        if existing.scalar_one_or_none() is None:
            break
        candidate = f"{base_slug}-{suffix}"
        suffix += 1

    # Create new tenant with username if provided in application data
    username = (application.data or {}).get("username") if application.data else None
    tenant = Tenant(
        name=tenant_name,
        slug=candidate,
        role=application.role,
        username=username,
        is_active=True,  # Approve on creation
        **payload
    )
    db.add(tenant)
    await db.flush()

    return tenant


async def _ensure_default_driver_payroll(
    db: AsyncSession,
    tenant: Tenant,
) -> DriverPricing:
    """Create the default payroll row once for an onboarded driver."""
    payroll = await db.scalar(
        select(DriverPricing).where(DriverPricing.driver_id == tenant.id)
    )
    if payroll is None:
        payroll = DriverPricing(
            driver_id=tenant.id,
            base_salary=DEFAULT_DRIVER_BASE_SALARY,
            commission_per_delivery=DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
        )
        db.add(payroll)
    return payroll


@router.post("/applications", response_model=OnboardingApplicationResponse)
async def submit_application(
    req: OnboardingApplicationCreateRequest,
    current_user: CurrentUserAllowInactive,
    db: AsyncSession = Depends(get_db),
) -> OnboardingApplicationResponse:
    if req.role not in {r.value for r in RoleEnum}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported role for onboarding.",
        )

    result = await db.execute(
        select(OnboardingApplication)
        .where(OnboardingApplication.user_id == current_user.id)
        .order_by(desc(OnboardingApplication.created_at))
    )
    existing = result.scalars().first()

    is_new_application = False
    if existing and existing.status in {ApplicationStatus.pre_pending, ApplicationStatus.pending}:
        existing.data = {**(existing.data or {}), **req.data}
        existing.role = req.role
        existing.status = ApplicationStatus.pending
        existing.reviewed_at = None
        existing.reviewed_by_id = None
        existing.decision_reason = None
        application = existing
    else:
        application = OnboardingApplication(
            user_id=current_user.id,
            role=req.role,
            status=ApplicationStatus.pending,
            data=req.data,
        )
        db.add(application)
        is_new_application = True

    await db.commit()
    await db.refresh(application)
    
    # Send submission confirmation email
    tenant_name = (req.data.get("fullName") or current_user.name or current_user.email).strip()
    contact_email = (req.data.get("email") or current_user.email).strip()
    send_onboarding_submitted_email.delay(tenant_name=tenant_name, contact_email=contact_email)
    
    return _to_response(application)


@router.get("/applications/me", response_model=OnboardingApplicationResponse | None)
async def get_my_application(
    current_user: CurrentUserAllowInactive,
    db: AsyncSession = Depends(get_db),
) -> OnboardingApplicationResponse | None:
    result = await db.execute(
        select(OnboardingApplication)
        .options(selectinload(OnboardingApplication.user))
        .where(OnboardingApplication.user_id == current_user.id)
        .order_by(desc(OnboardingApplication.created_at))
    )
    application = result.scalars().first()
    if application is None:
        return None
    return _to_response(application)


@router.get("/applications", response_model=list[OnboardingApplicationResponse])
async def list_applications(
    current_user: TenantAdmin,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[OnboardingApplicationResponse]:
    stmt = (
        select(OnboardingApplication)
        .options(selectinload(OnboardingApplication.user))
        .join(User, OnboardingApplication.user_id == User.id)
    )

    if status_filter:
        try:
            status_value = ApplicationStatus(status_filter)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported onboarding status.",
            ) from exc
        stmt = stmt.where(OnboardingApplication.status == status_value)

    if not current_user.is_platform_admin:
        stmt = stmt.where(User.tenant_id == current_user.tenant_id)

    result = await db.execute(stmt.order_by(desc(OnboardingApplication.created_at)))
    applications = result.scalars().all()
    return [_to_response(application) for application in applications]


@router.get("/applications/{application_id}", response_model=OnboardingApplicationResponse)
async def get_application(
    application_id: str,
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
) -> OnboardingApplicationResponse:
    stmt = (
        select(OnboardingApplication)
        .options(selectinload(OnboardingApplication.user))
        .join(User, OnboardingApplication.user_id == User.id)
        .where(OnboardingApplication.id == application_id)
    )
    if not current_user.is_platform_admin:
        stmt = stmt.where(User.tenant_id == current_user.tenant_id)

    result = await db.execute(stmt)
    application = result.scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return _to_response(application)


@router.post("/applications/{application_id}/approve", response_model=OnboardingApplicationResponse)
async def approve_application(
    application_id: str,
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
) -> OnboardingApplicationResponse:
    result = await db.execute(select(OnboardingApplication).where(OnboardingApplication.id == application_id))
    application = result.scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    if not current_user.is_platform_admin:
        user_result = await db.execute(select(User).where(User.id == application.user_id))
        applicant = user_result.scalar_one_or_none()
        if applicant is None or applicant.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    user_result = await db.execute(select(User).where(User.id == application.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    tenant: Tenant | None = None
    if application.role in {RoleEnum.vendor.value, RoleEnum.driver.value, RoleEnum.individual.value}:
        if user.tenant_id:
            tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
            tenant = tenant_result.scalar_one_or_none()
        if tenant is None:
            tenant = await _ensure_tenant_for_application(db, application)
        if tenant is not None:
            user.tenant_id = tenant.id
            if application.role == RoleEnum.driver.value:
                await _ensure_default_driver_payroll(db, tenant)

    user.is_active = True

    role_result = await db.execute(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role == application.role,
        )
    )
    if role_result.scalar_one_or_none() is None:
        db.add(UserRole(user_id=user.id, role=application.role))

    # Update application status
    application.status = ApplicationStatus.approved
    application.reviewed_at = datetime.now(timezone.utc)
    application.reviewed_by_id = current_user.id
    application.decision_reason = None

    await db.commit()
    await db.refresh(application)

    # Send approval email
    tenant_name = (application.data.get("fullName") or "").strip()
    contact_email = (application.data.get("email") or "").strip()
    if contact_email:
        send_onboarding_approved_email.delay(
            tenant_name=tenant_name,
            contact_email=contact_email,
            tenant_role=application.role,
        )

    return _to_response(application)


@router.post("/applications/{application_id}/reject", response_model=OnboardingApplicationResponse)
async def reject_application(
    application_id: str,
    req: OnboardingApplicationReviewRequest,
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
) -> OnboardingApplicationResponse:
    result = await db.execute(select(OnboardingApplication).where(OnboardingApplication.id == application_id))
    application = result.scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    if not current_user.is_platform_admin:
        user_result = await db.execute(select(User).where(User.id == application.user_id))
        applicant = user_result.scalar_one_or_none()
        if applicant is None or applicant.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    application.status = ApplicationStatus.rejected
    application.reviewed_at = datetime.now(timezone.utc)
    application.reviewed_by_id = current_user.id
    application.decision_reason = req.reason

    await db.commit()
    await db.refresh(application)

    # Send rejection email
    tenant_name = (application.data.get("fullName") or "").strip()
    contact_email = (application.data.get("email") or "").strip()
    if contact_email:
        send_onboarding_rejected_email.delay(
            tenant_name=tenant_name,
            contact_email=contact_email,
            reason=req.reason,
        )

    return _to_response(application)


@router.get("/applications/{application_id}/document")
async def download_application_document(
    application_id: str,
    name: str,
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    # Load application and check access
    result = await db.execute(
        select(OnboardingApplication).where(OnboardingApplication.id == application_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    # Ensure tenant scope for non-platform admins
    if not current_user.is_platform_admin:
        user_result = await db.execute(select(User).where(User.id == application.user_id))
        applicant = user_result.scalar_one_or_none()
        if applicant is None or applicant.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    # Build file path in uploads_dir/<application_id>/<name>
    uploads_dir = settings.uploads_dir
    filepath = os.path.join(uploads_dir, application_id, name)
    if not os.path.exists(filepath) or not os.path.isfile(filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    return FileResponse(filepath, filename=name)


@router.post("/applications/{application_id}/document", status_code=status.HTTP_204_NO_CONTENT)
async def upload_application_document(
    application_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(_get_current_user_allow_inactive),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(OnboardingApplication).where(OnboardingApplication.id == application_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    # Only the owner or tenant admins can upload documents
    if current_user.id != application.user_id and not current_user.is_platform_admin:
        user_result = await db.execute(select(User).where(User.id == application.user_id))
        applicant = user_result.scalar_one_or_none()
        if applicant is None or applicant.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is required.",
        )

    original_filename = Path(file.filename).name
    original_extension = Path(original_filename).suffix.lower()

    if original_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF, JPG, PNG, WebP, HEIC, HEIF, and TIFF files are allowed.",
        )

    content_type = (file.content_type or "").lower().strip()

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type.",
        )

    allowed_types_for_extension = EXTENSION_CONTENT_TYPE_MAP.get(original_extension)

    if content_type not in allowed_types_for_extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File extension does not match file type.",
        )

    safe_filename = original_filename

    upload_dir = Path(settings.uploads_dir) / str(application_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    final_filepath = upload_dir / safe_filename
    temp_filepath = upload_dir / f"{safe_filename}.part"

    total_size = 0

    try:
        with open(temp_filepath, "wb") as out_file:
            while chunk := await file.read(CHUNK_SIZE):
                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File too large. Maximum allowed size is 10 MB.",
                    )

                out_file.write(chunk)

        os.replace(temp_filepath, final_filepath)

    except HTTPException:
        if temp_filepath.exists():
            temp_filepath.unlink()
        raise

    except Exception:
        if temp_filepath.exists():
            temp_filepath.unlink()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file.",
        )

    finally:
        await file.close()
