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

/** Same reasoning for success: a QR match / upload confirmation is always green. */
export const SUCCESS = '#22c55e';
export const SUCCESS_SOFT = 'rgba(34, 197, 94, 0.14)';