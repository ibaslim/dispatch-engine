"""Pure helpers behind order scheduling and proof-of-delivery.

Damage if these are wrong:
  normalize_planned_at     -> a date-only stop keeps a stray time and breaks the midnight CHECK
  get_order_status         -> a delivery due now is filed as "scheduled" and missed
  _stamp_activity_status   -> a checkpoint timestamp is overwritten, losing the
                              real time the driver reached that stage
  _safe_pod_filename_stem  -> a crafted filename reaches the filesystem
"""
from datetime import datetime, timedelta

import pytest

from app.api.routers.orders import (
    APP_TIMEZONE,
    _safe_pod_filename_stem,
    _stamp_activity_status,
    get_order_status,
    schedule_error,
)
from app.schemas.order import normalize_planned_at
from app.models.order import ActivityStatus, Order, OrderStatus

pytestmark = pytest.mark.unit


def _planned(offset: timedelta) -> datetime:
    """Naive wall-clock planned time for now + offset, as the database stores it."""
    return (datetime.now(APP_TIMEZONE) + offset).replace(tzinfo=None, second=0, microsecond=0)


class TestNormalizePlannedAt:
    def test_a_specified_time_keeps_its_minute(self):
        assert normalize_planned_at(datetime(2026, 8, 27, 14, 30, 45), True) == datetime(2026, 8, 27, 14, 30)

    def test_a_date_only_stop_is_pinned_to_midnight(self):
        assert normalize_planned_at(datetime(2026, 8, 27, 14, 30), False) == datetime(2026, 8, 27)

    def test_a_real_midnight_stays_specified_midnight(self):
        assert normalize_planned_at(datetime(2026, 8, 27), True) == datetime(2026, 8, 27)


class TestGetOrderStatus:
    def test_a_delivery_due_within_three_hours_is_current(self):
        assert get_order_status(_planned(timedelta(hours=1)), True) is OrderStatus.current

    def test_a_delivery_far_in_the_future_is_scheduled(self):
        assert get_order_status(_planned(timedelta(days=2)), True) is OrderStatus.scheduled

    def test_a_delivery_already_past_is_current(self):
        assert get_order_status(_planned(timedelta(hours=-1)), True) is OrderStatus.current

    def test_a_date_only_delivery_is_current_on_its_date(self):
        """Without a time it may be due any moment that day, so it must not wait in Scheduled."""
        today = _planned(timedelta()).replace(hour=0, minute=0)
        assert get_order_status(today, False) is OrderStatus.current

    def test_a_date_only_delivery_on_a_later_date_is_scheduled(self):
        tomorrow = _planned(timedelta(days=1)).replace(hour=0, minute=0)
        assert get_order_status(tomorrow, False) is OrderStatus.scheduled



class TestScheduleError:
    NOW = datetime(2026, 9, 15, 12, 0)

    def check(self, pickup, pickup_timed, delivery, delivery_timed, **kwargs):
        return schedule_error(pickup, pickup_timed, delivery, delivery_timed, now=self.NOW, **kwargs)

    def test_an_upcoming_schedule_passes(self):
        assert self.check(datetime(2026, 9, 15, 14, 0), True, datetime(2026, 9, 15, 16, 0), True) is None

    def test_a_date_only_stop_today_passes_even_though_midnight_is_behind_us(self):
        assert self.check(datetime(2026, 9, 15), False, datetime(2026, 9, 15), False) is None

    def test_a_pickup_earlier_today_is_rejected(self):
        problem = self.check(datetime(2026, 9, 15, 9, 0), True, datetime(2026, 9, 15, 16, 0), True)
        assert problem == "Pickup can't be in the past."

    def test_a_time_just_behind_now_is_within_grace(self):
        assert self.check(datetime(2026, 9, 15, 11, 57), True, datetime(2026, 9, 15, 16, 0), True) is None

    def test_a_past_delivery_date_is_rejected(self):
        problem = self.check(datetime(2026, 9, 15), False, datetime(2026, 9, 14), False, check_pickup_past=False)
        assert problem == "Delivery can't be in the past."

    def test_delivery_before_the_pickup_date_is_rejected(self):
        problem = self.check(datetime(2026, 9, 20), False, datetime(2026, 9, 19), False)
        assert problem == "Delivery can't be before the pickup date."

    def test_delivery_at_or_before_the_pickup_time_is_rejected(self):
        problem = self.check(datetime(2026, 9, 20, 14, 0), True, datetime(2026, 9, 20, 14, 0), True)
        assert problem == "Delivery must be after the pickup time."

    def test_an_unmoved_past_stop_is_not_rechecked(self):
        """Editing an old order must not force its original dates forward."""
        assert self.check(
            datetime(2026, 8, 27, 10, 0), True, datetime(2026, 9, 20, 10, 0), True, check_pickup_past=False
        ) is None


class TestStampActivityStatus:
    def test_sets_the_status_and_records_the_checkpoint_time(self):
        order = Order(activity_status=ActivityStatus.driver_not_assigned)

        _stamp_activity_status(order, ActivityStatus.picked_up)

        assert order.activity_status is ActivityStatus.picked_up
        assert order.picked_up_at is not None

    def test_keeps_the_first_timestamp_when_a_stage_is_re_entered(self):
        """The checkpoint records when the stage was first reached, not the last."""
        order = Order(activity_status=ActivityStatus.driver_not_assigned)
        _stamp_activity_status(order, ActivityStatus.picked_up)
        first_time = order.picked_up_at

        _stamp_activity_status(order, ActivityStatus.delivered)
        _stamp_activity_status(order, ActivityStatus.picked_up)

        assert order.picked_up_at == first_time

    def test_handles_a_status_that_has_no_timestamp_column(self):
        order = Order(activity_status=ActivityStatus.picked_up)

        _stamp_activity_status(order, ActivityStatus.driver_not_assigned)

        assert order.activity_status is ActivityStatus.driver_not_assigned


class TestSafePodFilenameStem:
    @pytest.mark.parametrize(
        "value,expected",
        [
            ("delivery-photo_1", "delivery-photo_1"),
            ("../../etc/passwd", "etcpasswd"),
            ("photo 2024.png", "photo2024png"),
            ("sig;rm -rf /", "sigrm-rf"),
        ],
    )
    def test_strips_everything_but_alphanumerics_dash_and_underscore(self, value, expected):
        assert _safe_pod_filename_stem(value) == expected

    @pytest.mark.parametrize("value", ["", "///", "!!!"])
    def test_falls_back_to_a_default_when_nothing_survives(self, value):
        assert _safe_pod_filename_stem(value) == "delivery"
