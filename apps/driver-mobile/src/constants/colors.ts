/**
 * Fixed colors that sit outside the theme token set.
 *
 * Danger is deliberately not a theme token: "report a problem" must read the
 * same alarming red under every accent theme, whereas tokens re-tint per theme.
 * `BottomSheetItem`'s rose tint uses these same values.
 */
export const DANGER = '#f43f5e';
export const DANGER_SOFT = 'rgba(244, 63, 94, 0.12)';
export const DANGER_BORDER = 'rgba(244, 63, 94, 0.45)';

/**
 * Opaque danger surfaces, for panels that must not let the page show through.
 *
 * `DANGER_SOFT` is alpha-composited, which is right for a tint floating over an
 * arbitrary background but wrong for a solid panel: the page bleeds through and
 * the panel reads washed out — worst in dark mode, where a 12% rose over a
 * near-black background barely registers. These are pre-composited instead, and
 * tuned to sit at roughly the same lightness as the `card` token in each scheme.
 */
const DANGER_SURFACE = { light: '#fff1f2', dark: '#38151f' } as const;
const DANGER_SURFACE_BORDER = { light: '#fecdd3', dark: '#7f2436' } as const;

/** Solid danger panel colors for the active color scheme. */
export function dangerSurface(scheme: 'light' | 'dark'): {
  backgroundColor: string;
  borderColor: string;
} {
  return {
    backgroundColor: DANGER_SURFACE[scheme],
    borderColor: DANGER_SURFACE_BORDER[scheme],
  };
}

/** Same reasoning for success: a QR match / upload confirmation is always green. */
export const SUCCESS = '#22c55e';
export const SUCCESS_SOFT = 'rgba(34, 197, 94, 0.14)';

/** Time running out on a broadcast offer. Amber sits between SUCCESS and DANGER. */
export const WARNING = '#fbbf24';

/**
 * Colour for a countdown that has `percent` of its window left.
 *
 * Fixed rather than themed for the same reason as DANGER: a deadline must read
 * with the same urgency under every accent theme. The thresholds match the
 * dispatcher's published-orders feed, so both clients agree at a glance.
 */
export function countdownColor(percent: number): string {
  if (percent > 50) return SUCCESS;
  if (percent > 20) return WARNING;
  return DANGER;
}

/** Soft fills for Home's stat chips, which need four tints that stay distinct. */
export const WARNING_SOFT = 'rgba(251, 191, 36, 0.16)';
export const ACCENT = '#8b5cf6';
export const ACCENT_SOFT = 'rgba(139, 92, 246, 0.14)';
