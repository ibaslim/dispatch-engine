import { formatStopDate, formatStopTime, formatStopWhen } from '../schedule';

describe('schedule formatting', () => {
  it('keeps the planned calendar day, whatever the device zone', () => {
    // Parsing "2026-09-20T00:00:00" as UTC would roll back to Sep 19 west of Greenwich.
    expect(formatStopDate('2026-09-20T00:00:00')).toMatch(/20/);
    expect(formatStopDate('2026-09-20T00:00:00')).not.toMatch(/19/);
  });

  it('shows the time for a timed stop', () => {
    const time = formatStopTime('2026-09-20T14:30:00', true);

    expect(time).not.toBeNull();
    expect(time).toMatch(/30/);
  });

  it('has no time for a date-only stop', () => {
    expect(formatStopTime('2026-09-20T00:00:00', false)).toBeNull();
    expect(formatStopWhen('2026-09-20T00:00:00', false)).toMatch(/, any time$/);
  });

  it('joins date and time for a timed stop', () => {
    const when = formatStopWhen('2026-09-20T14:30:00', true);

    expect(when.startsWith(formatStopDate('2026-09-20T14:30:00'))).toBe(true);
    expect(when).not.toMatch(/any time/);
  });
});
