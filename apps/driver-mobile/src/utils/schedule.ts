/**
 * Display helpers for planned stop times. `*_planned_at` is wall-clock time with
 * no zone, so it's split by hand and rebuilt in the device's zone, never parsed
 * as a UTC instant.
 */
import { plannedTime } from '@dispatch/shared/contracts';
import { countdownGradient } from '@constants/colors';

function localDay(plannedAt: string): Date {
  const [year, month, day] = plannedAt.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Sat, Sep 20" in the device's locale. */
export function formatStopDate(plannedAt: string): string {
  return localDay(plannedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "2:30 PM" in the device's locale, or null for a date-only stop. */
export function formatStopTime(plannedAt: string, timeSpecified: boolean): string | null {
  const clock = plannedTime(plannedAt, timeSpecified);
  if (!clock) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  const moment = localDay(plannedAt);
  moment.setHours(hours, minutes);
  return moment.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Sat, Sep 20, 2:30 PM", or "Sat, Sep 20, any time" for a date-only stop. */
export function formatStopWhen(plannedAt: string, timeSpecified: boolean): string {
  return `${formatStopDate(plannedAt)}, ${formatStopTime(plannedAt, timeSpecified) ?? 'any time'}`;
}

/** Minutes from now to the stop's clock time, +/- either way. Null for a date-only stop. */
export function minutesUntilStop(plannedAt: string, timeSpecified: boolean): number | null {
  const clock = plannedTime(plannedAt, timeSpecified);
  if (!clock) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  const moment = localDay(plannedAt);
  moment.setHours(hours, minutes);
  return Math.round((moment.getTime() - Date.now()) / 60_000);
}

/** "in 25 min", "in 2 hr 15 min", "5 min ago", or "now" within a minute either way. */
export function formatRelativeStop(minutes: number): string {
  if (Math.abs(minutes) < 1) return 'now';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const span = hours === 0 ? `${rest} min` : rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
  return minutes > 0 ? `in ${span}` : `${span} ago`;
}

/** Green at a full hour out, easing to red by the time a stop is due. */
const GRADIENT_WINDOW_MINUTES = 60;

/** Countdown text color plus a matching ~12%-alpha fill, shared by any "time until stop" badge. */
export function stopCountdownTint(minutes: number): { color: string; background: string } {
  const color = countdownGradient(minutes / GRADIENT_WINDOW_MINUTES);
  return { color, background: `${color}1F` };
}
