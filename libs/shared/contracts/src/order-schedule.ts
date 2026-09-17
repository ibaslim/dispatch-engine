// `*_planned_at` is wall-clock time with no zone ("2026-09-20T13:40:00"); slice it, never pass it through Date.

/** `YYYY-MM-DD` part of a planned timestamp. */
export function plannedDate(plannedAt: string): string {
  return plannedAt.slice(0, 10);
}

/** `HH:MM` part, or null when the stop is date-only. */
export function plannedTime(plannedAt: string, timeSpecified: boolean): string | null {
  return timeSpecified ? plannedAt.slice(11, 16) : null;
}

/** Joins a date and optional `HH:MM` time; a missing time stores midnight and clears the flag. */
export function toPlannedAt(
  date: string,
  time?: string | null,
): { plannedAt: string; timeSpecified: boolean } {
  return time
    ? { plannedAt: `${date}T${time}:00`, timeSpecified: true }
    : { plannedAt: `${date}T00:00:00`, timeSpecified: false };
}
