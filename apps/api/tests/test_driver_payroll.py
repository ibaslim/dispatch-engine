import asyncio
import uuid

from app.api.routers.driver_payroll import (
    DriverCompensation,
    _apply_driver_compensation,
)
from app.api.routers.onboarding import (
    _ensure_default_driver_payroll,
)
from app.models.location import (
    DEFAULT_DRIVER_BASE_SALARY,
    DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
    DriverCityPricing,
    DriverPricing,
    DriverStatePricing,
)
from app.models.tenant import Tenant


class _FakePayrollSession:
    def __init__(self, existing: DriverPricing | None = None):
        self.existing = existing
        self.added: list[DriverPricing] = []

    async def scalar(self, _statement):
        return self.existing

    def add(self, payroll: DriverPricing) -> None:
        self.added.append(payroll)


def test_driver_compensation_defaults_to_200_base_salary():
    compensation = DriverCompensation()

    assert compensation.base_salary == DEFAULT_DRIVER_BASE_SALARY
    assert (
        compensation.commission_per_delivery
        == DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
    )


def test_apply_driver_compensation_updates_each_payroll_level():
    compensation = DriverCompensation(
        base_salary=350,
        commission_per_delivery=12.5,
    )

    for payroll in (DriverPricing(), DriverStatePricing(), DriverCityPricing()):
        _apply_driver_compensation(payroll, compensation)

        assert payroll.base_salary == 350
        assert payroll.commission_per_delivery == 12.5


def test_onboarding_assigns_default_payroll_to_new_driver():
    tenant = Tenant(id=uuid.uuid4(), name="Driver", slug="driver")
    db = _FakePayrollSession()

    payroll = asyncio.run(_ensure_default_driver_payroll(db, tenant))

    assert payroll.driver_id == tenant.id
    assert payroll.base_salary == DEFAULT_DRIVER_BASE_SALARY
    assert (
        payroll.commission_per_delivery
        == DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
    )
    assert db.added == [payroll]


def test_onboarding_keeps_existing_driver_payroll():
    tenant = Tenant(id=uuid.uuid4(), name="Driver", slug="driver")
    existing = DriverPricing(
        driver_id=tenant.id,
        base_salary=500,
        commission_per_delivery=20,
    )
    db = _FakePayrollSession(existing)

    payroll = asyncio.run(_ensure_default_driver_payroll(db, tenant))

    assert payroll is existing
    assert db.added == []
