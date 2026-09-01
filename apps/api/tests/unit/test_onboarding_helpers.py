"""Pure helpers behind onboarding approval.

Damage if these are wrong:
  _slugify              -> a tenant gets an unusable or colliding URL slug
  _extract_tenant_payload -> contact details land in the wrong column, or empty
                             strings are stored where the app expects NULL
"""
import pytest

from app.api.routers.onboarding import _extract_tenant_payload, _slugify

pytestmark = pytest.mark.unit


class TestSlugify:
    @pytest.mark.parametrize(
        "value,expected",
        [
            ("Acme Foods Inc", "acme-foods-inc"),
            ("Acme", "acme"),
            ("Store 42", "store-42"),
            ("A & B", "a-b"),
            ("Acme---Foods", "acme-foods"),
            ("  Acme!  ", "acme"),
            ("--Acme--", "acme"),
        ],
    )
    def test_builds_a_url_safe_slug(self, value, expected):
        assert _slugify(value) == expected

    def test_returns_empty_string_when_nothing_survives(self):
        """Callers rely on the empty string to fall back to the role name."""
        assert _slugify("日本語") == ""
        assert _slugify("!!!") == ""


class TestExtractTenantPayload:
    def test_maps_form_fields_onto_tenant_columns(self):
        data = {
            "fullName": "Jane Doe",
            "email": "jane@example.com",
            "phone": {"countryCode": "+1", "number": "5551234"},
            "address": "1 Main St",
            "businessNumber": "BN-123",
            "notes": "Handle with care",
            "nationalIdFileName": "id.pdf",
        }

        payload = _extract_tenant_payload(data, "", "")

        assert payload == {
            "contact_name": "Jane Doe",
            "contact_email": "jane@example.com",
            "contact_phone_country_code": "+1",
            "contact_phone_number": "5551234",
            "address": "1 Main St",
            "ntn_number": "BN-123",
            "notes": "Handle with care",
            "national_id_file_name": "id.pdf",
        }

    def test_trims_surrounding_whitespace(self):
        data = {"fullName": "  Jane Doe  ", "address": "\t1 Main St\n"}

        payload = _extract_tenant_payload(data, "", "")

        assert payload["contact_name"] == "Jane Doe"
        assert payload["address"] == "1 Main St"

    def test_blank_values_become_none_not_empty_string(self):
        """The Tenant columns are nullable; empty strings would be stored as data."""
        payload = _extract_tenant_payload({"fullName": "   ", "address": ""}, "", "")

        assert payload["contact_name"] is None
        assert payload["address"] is None

    def test_missing_keys_produce_none(self):
        payload = _extract_tenant_payload({}, "", "")

        assert set(payload) == {
            "contact_name",
            "contact_email",
            "contact_phone_country_code",
            "contact_phone_number",
            "address",
            "ntn_number",
            "notes",
            "national_id_file_name",
        }
        assert all(value is None for value in payload.values())

    def test_falls_back_to_the_users_name_and_email(self):
        payload = _extract_tenant_payload({}, "Account Name", "account@example.com")

        assert payload["contact_name"] == "Account Name"
        assert payload["contact_email"] == "account@example.com"

    def test_form_data_wins_over_the_fallback(self):
        data = {"fullName": "Form Name", "email": "form@example.com"}

        payload = _extract_tenant_payload(data, "Account Name", "account@example.com")

        assert payload["contact_name"] == "Form Name"
        assert payload["contact_email"] == "form@example.com"

    def test_business_number_is_preferred_over_ntn_number(self):
        data = {"businessNumber": "BN-1", "ntnNumber": "NTN-1"}

        assert _extract_tenant_payload(data, "", "")["ntn_number"] == "BN-1"

    def test_ntn_number_is_used_when_business_number_is_absent(self):
        data = {"ntnNumber": "NTN-1"}

        assert _extract_tenant_payload(data, "", "")["ntn_number"] == "NTN-1"

    def test_survives_a_phone_field_that_is_not_an_object(self):
        """Older mobile clients posted phone as a bare string."""
        payload = _extract_tenant_payload({"phone": "5551234"}, "", "")

        assert payload["contact_phone_country_code"] is None
        assert payload["contact_phone_number"] is None
