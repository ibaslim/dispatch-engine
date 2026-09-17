// ─── Countdown helpers for a scheduled stop's clock time ──────────────────
// Pure, framework-agnostic — shared by anything that shows "how long until
// this stop" (the order-detail page's schedule timeline today).

/** date: "YYYY-MM-DD", time: "HH:mm" (24h). Both wall-clock, no zone. */
function localMoment(date: string, time: string): Date | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
  const moment = new Date(year, month - 1, day);
  moment.setHours(hours || 0, minutes || 0, 0, 0);
  return moment;
}

/** Minutes from `now` to the stop's clock time, +/- either way. Null for a date-only stop. */
export function minutesUntilStop(date: string, time: string, timeSpecified: boolean, now: number = Date.now()): number | null {
  if (!timeSpecified || !time) return null;
  const moment = localMoment(date, time);
  if (!moment) return null;
  return Math.round((moment.getTime() - now) / 60_000);
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

// Same trio the Orders table already uses for status badges (bg-emerald-100
// text-emerald-800 / amber / red in table.component.ts) — a driver reads the
// same urgency color whether it's a badge or this countdown.
const SUCCESS = '#10b981'; // emerald-500
const WARNING = '#f59e0b'; // amber-500
const DANGER = '#ef4444'; // red-500

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${mix(fr, tr)}${mix(fg, tg)}${mix(fb, tb)}`;
}

/**
 * SUCCESS -> WARNING -> DANGER as a continuous dial: `percent` is how much of
 * the window is left (1 = just started, 0 = due now), so the color eases
 * through amber instead of jumping between fixed bands.
 */
export function countdownGradient(percent: number): string {
  const clamped = Math.max(0, Math.min(1, percent));
  return clamped > 0.5
    ? mixHex(SUCCESS, WARNING, (1 - clamped) * 2)
    : mixHex(WARNING, DANGER, (0.5 - clamped) * 2);
}

/** Green at a full hour out, easing to red by the time a stop is due. */
const GRADIENT_WINDOW_MINUTES = 60;

/** Text color plus a matching ~12%-alpha fill, for a countdown pill/badge. */
export function stopCountdownTint(minutes: number): { color: string; background: string } {
  const color = countdownGradient(minutes / GRADIENT_WINDOW_MINUTES);
  return { color, background: `${color}1F` };
}
