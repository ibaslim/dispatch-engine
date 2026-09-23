"""When a discount applies: always, or on a recurring window.

A schedule is stored as JSON on the discount and evaluated against the order's
planned pickup time. Recurrence is the point: "Christmas" is one date every
year, "Black Friday" is the day after the fourth Thursday of November, and
"off-peak" is a window inside certain weekdays.

Pure functions, no I/O, so the rules are testable on their own.
"""
import calendar
from datetime import date, datetime, time, timedelta
from typing import Any

ALWAYS = "always"
WEEKLY = "weekly"
ANNUAL = "annual"
ANNUAL_NTH_WEEKDAY = "annual_nth_weekday"
DATE_LIST = "date_list"

KINDS = (ALWAYS, WEEKLY, ANNUAL, ANNUAL_NTH_WEEKDAY, DATE_LIST)

# Monday-first, matching datetime.weekday().
DAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
SHORT_DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
NTH_NAMES = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", -1: "last"}

DEFAULT: dict[str, Any] = {"kind": ALWAYS}


def _parse_time(value: Any) -> time | None:
    if not value:
        return None
    if isinstance(value, time):
        return value
    try:
        hours, minutes = str(value).split(":")[:2]
        return time(int(hours), int(minutes))
    except (TypeError, ValueError):
        return None


def _within_time_range(value: time, start: time, end: time) -> bool:
    """Handles a window that runs past midnight, like 22:00-02:00."""
    if start < end:
        return start <= value < end
    return value >= start or value < end


def _in_window(day: date, start: date, duration_days: int) -> bool:
    return start <= day < start + timedelta(days=max(1, duration_days))


def nth_weekday_of_month(year: int, month: int, weekday: int, nth: int) -> date | None:
    """The nth given weekday in a month; nth = -1 means the last one."""
    days_in_month = calendar.monthrange(year, month)[1]
    matching = [
        day
        for day in range(1, days_in_month + 1)
        if date(year, month, day).weekday() == weekday
    ]
    if not matching:
        return None
    try:
        return date(year, month, matching[-1] if nth == -1 else matching[nth - 1])
    except IndexError:
        return None


def _matches_time(schedule: dict[str, Any], at: datetime, time_specified: bool) -> bool:
    """A date-only stop has no clock time to test, so a window can't exclude it."""
    start = _parse_time(schedule.get("time_start"))
    end = _parse_time(schedule.get("time_end"))
    if start is None or end is None or not time_specified:
        return True
    return _within_time_range(at.time(), start, end)


def matches(schedule: dict[str, Any] | None, at: datetime, time_specified: bool = True) -> bool:
    """Whether a discount on this schedule applies to a stop planned at `at`."""
    schedule = schedule or DEFAULT
    kind = str(schedule.get("kind") or ALWAYS)
    day = at.date()

    if kind == ALWAYS:
        return True

    if kind == WEEKLY:
        days = [int(value) for value in (schedule.get("days") or [])]
        if days and day.weekday() not in days:
            return False
        return _matches_time(schedule, at, time_specified)

    if kind == ANNUAL:
        month, month_day = int(schedule.get("month") or 0), int(schedule.get("day") or 0)
        if not month or not month_day:
            return False
        duration = int(schedule.get("duration_days") or 1)
        # The previous year's window can still be running (e.g. Boxing week).
        for year in (day.year, day.year - 1):
            try:
                start = date(year, month, month_day)
            except ValueError:
                continue
            if _in_window(day, start, duration):
                return _matches_time(schedule, at, time_specified)
        return False

    if kind == ANNUAL_NTH_WEEKDAY:
        month = int(schedule.get("month") or 0)
        weekday = int(schedule.get("weekday") or 0)
        nth = int(schedule.get("nth") or 1)
        offset = int(schedule.get("offset_days") or 0)
        duration = int(schedule.get("duration_days") or 1)
        if not month:
            return False
        for year in (day.year, day.year - 1):
            anchor = nth_weekday_of_month(year, month, weekday, nth)
            if anchor is None:
                continue
            if _in_window(day, anchor + timedelta(days=offset), duration):
                return _matches_time(schedule, at, time_specified)
        return False

    if kind == DATE_LIST:
        for raw in schedule.get("dates") or []:
            try:
                if date.fromisoformat(str(raw)) == day:
                    return _matches_time(schedule, at, time_specified)
            except ValueError:
                continue
        return False

    # An unknown kind never matches, rather than applying everywhere by accident.
    return False


def _time_suffix(schedule: dict[str, Any]) -> str:
    start = _parse_time(schedule.get("time_start"))
    end = _parse_time(schedule.get("time_end"))
    if start is None or end is None:
        return ""
    return f", {start.strftime('%H:%M')}-{end.strftime('%H:%M')}"


def describe(schedule: dict[str, Any] | None) -> str:
    """A short human sentence for the admin list and the picker."""
    schedule = schedule or DEFAULT
    kind = str(schedule.get("kind") or ALWAYS)

    if kind == ALWAYS:
        return "Any day"

    if kind == WEEKLY:
        days = [int(value) for value in (schedule.get("days") or [])]
        names = ", ".join(SHORT_DAY_NAMES[day] for day in sorted(days) if 0 <= day <= 6)
        return f"{names or 'Every day'}{_time_suffix(schedule)}"

    if kind == ANNUAL:
        month, day = int(schedule.get("month") or 0), int(schedule.get("day") or 0)
        duration = int(schedule.get("duration_days") or 1)
        try:
            label = date(2000, month, day).strftime("%d %B").lstrip("0")
        except ValueError:
            return "Every year"
        span = f" for {duration} days" if duration > 1 else ""
        return f"{label} every year{span}{_time_suffix(schedule)}"

    if kind == ANNUAL_NTH_WEEKDAY:
        month = int(schedule.get("month") or 0)
        weekday = int(schedule.get("weekday") or 0)
        nth = int(schedule.get("nth") or 1)
        offset = int(schedule.get("offset_days") or 0)
        duration = int(schedule.get("duration_days") or 1)
        try:
            month_name = date(2000, month, 1).strftime("%B")
        except ValueError:
            return "Every year"
        nth_name = NTH_NAMES.get(nth, f"{nth}th")
        base = f"The {nth_name} {DAY_NAMES[weekday % 7]} of {month_name}"
        if offset:
            base += f", {abs(offset)} day{'s' if abs(offset) > 1 else ''} "
            base += "later" if offset > 0 else "earlier"
        span = f", for {duration} days" if duration > 1 else ""
        return f"{base}{span}, every year{_time_suffix(schedule)}"

    if kind == DATE_LIST:
        dates = [str(value) for value in (schedule.get("dates") or [])]
        if not dates:
            return "No dates set"
        shown = ", ".join(sorted(dates)[:3])
        more = f" +{len(dates) - 3} more" if len(dates) > 3 else ""
        return f"On {shown}{more}{_time_suffix(schedule)}"

    return "Any day"
