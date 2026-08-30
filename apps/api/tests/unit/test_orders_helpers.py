"""Pure helpers behind order scheduling and proof-of-delivery.

Damage if these are wrong:
  parse_order_datetime     -> orders land in the wrong timezone
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
    parse_order_datetime,
)
from app.models.order import ActivityStatus, Order, OrderStatus

pytestmark = pytest.mark.unit


def _at(offset: timedelta) -> tuple[str, str]:
    """Return (date, time) strings for now + offset, in the app's timezone."""
    moment = datetime.now(APP_TIMEZONE) + offset
    return moment.strftime("%Y-%m-%d"), moment.strftime("%H:%M")


class TestParseOrderDatetime:
    def test_parses_date_and_time_into_the_app_timezone(self):
        parsed = parse_order_datetime("2026-08-27", "14:30")

        assert (parsed.year, parsed.month, parsed.day) == (2026, 8, 27)
        assert (parsed.hour, parsed.minute) == (14, 30)
        assert parsed.tzinfo is APP_TIMEZONE

    @pytest.mark.parametrize("date_value,time_value", [("27-08-2026", "14:30"), ("2026-08-27", "2:30 PM"), ("", "")])
    def test_rejects_input_it_cannot_parse(self, date_value, time_value):
        with pytest.raises(ValueError):
            parse_order_datetime(date_value, time_value)


class TestGetOrderStatus:
    def test_a_delivery_due_within_three_hours_is_current(self):
        pickup_date, pickup_time = _at(timedelta(minutes=30))
        delivery_date, delivery_time = _at(timedelta(hours=1))

        status = get_order_status(pickup_date, pickup_time, delivery_date, delivery_time)

        assert status is OrderStatus.current

    def test_a_delivery_far_in_the_future_is_scheduled(self):
        pickup_date, pickup_time = _at(timedelta(days=2))
        delivery_date, delivery_time = _at(timedelta(days=2, hours=1))

        status = get_order_status(pickup_date, pickup_time, delivery_date, delivery_time)

        assert status is OrderStatus.scheduled

    def test_a_delivery_already_past_is_current(self):
        pickup_date, pickup_time = _at(timedelta(hours=-3))
        delivery_date, delivery_time = _at(timedelta(hours=-1))

        status = get_order_status(pickup_date, pickup_time, delivery_date, delivery_time)

        assert status is OrderStatus.current

    def test_falls_back_to_a_time_only_comparison_when_the_date_is_unparseable(self):
        """Older clients post times without a usable date; the gap still decides."""
        assert get_order_status("n/a", "09:00", "n/a", "10:00") is OrderStatus.current
        assert get_order_status("n/a", "09:00", "n/a", "17:00") is OrderStatus.scheduled


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
