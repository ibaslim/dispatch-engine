from datetime import datetime

from app.services.discounts.schedule import describe, matches, nth_weekday_of_month


def _at(text: str) -> datetime:
    return datetime.fromisoformat(text)


class TestAlways:
    def test_no_schedule_always_matches(self) -> None:
        assert matches(None, _at("2026-09-21T10:00")) is True

    def test_an_unknown_kind_never_matches(self) -> None:
        """Better to apply nothing than to apply everywhere by accident."""
        assert matches({"kind": "lunar"}, _at("2026-09-21T10:00")) is False


class TestWeekly:
    schedule = {"kind": "weekly", "days": [1, 2, 3], "time_start": "10:00", "time_end": "14:00"}

    def test_matches_inside_the_window(self) -> None:
        # 2026-09-22 is a Tuesday.
        assert matches(self.schedule, _at("2026-09-22T10:30")) is True

    def test_misses_the_wrong_day(self) -> None:
        # Monday.
        assert matches(self.schedule, _at("2026-09-21T10:30")) is False

    def test_misses_outside_the_hours(self) -> None:
        assert matches(self.schedule, _at("2026-09-22T15:00")) is False

    def test_a_date_only_stop_ignores_the_hours(self) -> None:
        """A date-only pickup has no clock time a window could exclude."""
        assert matches(self.schedule, _at("2026-09-22T00:00"), time_specified=False) is True

    def test_a_window_can_run_past_midnight(self) -> None:
        overnight = {"kind": "weekly", "days": [1], "time_start": "22:00", "time_end": "02:00"}

        assert matches(overnight, _at("2026-09-22T23:30")) is True
        assert matches(overnight, _at("2026-09-22T12:00")) is False

    def test_no_days_means_every_day(self) -> None:
        assert matches({"kind": "weekly", "days": []}, _at("2026-09-21T10:00")) is True


class TestAnnual:
    christmas = {"kind": "annual", "month": 12, "day": 25}

    def test_matches_the_day_every_year(self) -> None:
        assert matches(self.christmas, _at("2026-12-25T09:00")) is True
        assert matches(self.christmas, _at("2027-12-25T09:00")) is True

    def test_misses_other_days(self) -> None:
        assert matches(self.christmas, _at("2026-12-24T09:00")) is False

    def test_a_multi_day_window(self) -> None:
        boxing_week = {"kind": "annual", "month": 12, "day": 26, "duration_days": 7}

        assert matches(boxing_week, _at("2026-12-26T09:00")) is True
        assert matches(boxing_week, _at("2026-12-31T09:00")) is True
        # Seven days from 26 December runs to 1 January, so 2 January is outside.
        assert matches(boxing_week, _at("2027-01-01T09:00")) is True
        assert matches(boxing_week, _at("2027-01-02T09:00")) is False

    def test_an_impossible_date_never_matches(self) -> None:
        assert matches({"kind": "annual", "month": 2, "day": 30}, _at("2026-02-28T09:00")) is False


class TestAnnualNthWeekday:
    # The day after the fourth Thursday of November.
    black_friday = {
        "kind": "annual_nth_weekday",
        "month": 11,
        "weekday": 3,
        "nth": 4,
        "offset_days": 1,
    }

    def test_finds_black_friday_each_year(self) -> None:
        assert matches(self.black_friday, _at("2026-11-27T09:00")) is True
        assert matches(self.black_friday, _at("2027-11-26T09:00")) is True

    def test_misses_the_day_before(self) -> None:
        assert matches(self.black_friday, _at("2026-11-26T09:00")) is False

    def test_a_weekend_sale_spanning_days(self) -> None:
        weekend = {**self.black_friday, "duration_days": 4}

        assert matches(weekend, _at("2026-11-30T09:00")) is True
        assert matches(weekend, _at("2026-12-01T09:00")) is False

    def test_the_last_weekday_of_a_month(self) -> None:
        last_friday = {"kind": "annual_nth_weekday", "month": 5, "weekday": 4, "nth": -1}

        assert matches(last_friday, _at("2026-05-29T09:00")) is True
        assert matches(last_friday, _at("2026-05-22T09:00")) is False

    def test_nth_weekday_helper(self) -> None:
        assert nth_weekday_of_month(2026, 11, 3, 4).isoformat() == "2026-11-26"
        assert nth_weekday_of_month(2026, 5, 4, -1).isoformat() == "2026-05-29"
        # A fifth Monday that does not exist.
        assert nth_weekday_of_month(2026, 2, 0, 5) is None


class TestDateList:
    schedule = {"kind": "date_list", "dates": ["2026-11-27", "2026-12-24"]}

    def test_matches_a_listed_date(self) -> None:
        assert matches(self.schedule, _at("2026-11-27T09:00")) is True

    def test_misses_anything_else(self) -> None:
        assert matches(self.schedule, _at("2026-11-28T09:00")) is False

    def test_an_unreadable_date_is_skipped(self) -> None:
        assert matches({"kind": "date_list", "dates": ["nope"]}, _at("2026-11-27T09:00")) is False


class TestDescribe:
    def test_reads_as_a_sentence(self) -> None:
        assert describe(None) == "Any day"
        assert describe({"kind": "weekly", "days": [1, 2], "time_start": "10:00", "time_end": "14:00"}) == (
            "Tue, Wed, 10:00-14:00"
        )
        assert describe({"kind": "annual", "month": 12, "day": 25}) == "25 December every year"
        assert describe(
            {"kind": "annual_nth_weekday", "month": 11, "weekday": 3, "nth": 4, "offset_days": 1}
        ) == "The fourth Thursday of November, 1 day later, every year"
        assert describe({"kind": "date_list", "dates": ["2026-11-27"]}) == "On 2026-11-27"
