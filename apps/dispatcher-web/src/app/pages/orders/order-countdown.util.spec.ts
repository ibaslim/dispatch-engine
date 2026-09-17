import { countdownGradient, formatRelativeStop, minutesUntilStop } from './order-countdown.util';

const NOW = new Date(2026, 8, 20, 14, 0, 0).getTime(); // 2026-09-20 14:00 local

describe('minutesUntilStop', () => {
  it('is null for a date-only stop', () => {
    expect(minutesUntilStop('2026-09-20', '', false, NOW)).toBeNull();
  });

  it('counts minutes ahead for a future stop', () => {
    expect(minutesUntilStop('2026-09-20', '14:25', true, NOW)).toBe(25);
  });

  it('goes negative once the stop is overdue', () => {
    expect(minutesUntilStop('2026-09-20', '13:45', true, NOW)).toBe(-15);
  });
});

describe('formatRelativeStop', () => {
  it('formats minutes and hours ahead', () => {
    expect(formatRelativeStop(25)).toBe('in 25 min');
    expect(formatRelativeStop(135)).toBe('in 2 hr 15 min');
    expect(formatRelativeStop(120)).toBe('in 2 hr');
  });

  it('formats overdue stops as "ago"', () => {
    expect(formatRelativeStop(-15)).toBe('15 min ago');
  });

  it('rounds anything under a minute to "now"', () => {
    expect(formatRelativeStop(0)).toBe('now');
  });
});

describe('countdownGradient', () => {
  it('is pure green a full window out and pure red once due', () => {
    expect(countdownGradient(1)).toBe('#10b981');
    expect(countdownGradient(0)).toBe('#ef4444');
  });

  it('sits at amber halfway through the window', () => {
    expect(countdownGradient(0.5)).toBe('#f59e0b');
  });
});
