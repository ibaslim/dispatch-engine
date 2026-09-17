import type { NewOrderFormValue } from '@models/new-order-form/new-order-form.model';
import { baselineFrom, hasScheduleErrors, scheduleErrors } from './order-schedule.util';

// 15 Sep 2026, 15:00 in the browser's zone.
const NOW = new Date(2026, 8, 15, 15, 0);
const TODAY = '2026-09-15';

type Stop = [date: string, time: string, timeSpecified: boolean];

function form(pickup: Stop, delivery: Stop): NewOrderFormValue {
  return {
    pickup: { pickupDate: pickup[0], pickupTime: pickup[1], pickupTimeSpecified: pickup[2] },
    delivery: { deliveryDate: delivery[0], deliveryTime: delivery[1], deliveryTimeSpecified: delivery[2] },
  } as unknown as NewOrderFormValue;
}

describe('scheduleErrors: time rules', () => {
  it('rejects a pickup time earlier today', () => {
    const errors = scheduleErrors(form([TODAY, '10:00', true], [TODAY, '', false]), null, NOW);
    expect(errors.pickupTime).toBe('That time has already passed today.');
  });

  it('accepts a pickup time later today', () => {
    const errors = scheduleErrors(form([TODAY, '16:00', true], [TODAY, '', false]), null, NOW);
    expect(errors.pickupTime).toBe('');
  });

  it('rejects a delivery time earlier today', () => {
    const errors = scheduleErrors(form([TODAY, '', false], [TODAY, '11:00', true]), null, NOW);
    expect(errors.deliveryTime).toBe('That time has already passed today.');
  });

  it('rejects a same-day delivery that is not after the pickup time', () => {
    const errors = scheduleErrors(form([TODAY, '16:00', true], [TODAY, '15:30', true]), null, NOW);
    expect(errors.deliveryTime).toBe('Delivery must be after the pickup time.');
  });

  it('asks for a time when the box is ticked but no time is chosen', () => {
    const errors = scheduleErrors(form([TODAY, '', true], [TODAY, '', false]), null, NOW);
    expect(errors.pickupTime).toBe('Choose a pickup time, or untick "Set a specific time".');
  });

  it('ignores a leftover time once the box is unticked', () => {
    const errors = scheduleErrors(form([TODAY, '10:00', false], [TODAY, '', false]), null, NOW);
    expect(hasScheduleErrors(errors)).toBe(false);
  });

  it('allows any time on a later date', () => {
    const errors = scheduleErrors(form(['2026-09-16', '09:00', true], ['2026-09-16', '10:00', true]), null, NOW);
    expect(hasScheduleErrors(errors)).toBe(false);
  });

  it('does not flag a past time the order already had when editing', () => {
    const value = form([TODAY, '10:00', true], [TODAY, '18:00', true]);
    const errors = scheduleErrors(value, baselineFrom(value), NOW);
    expect(errors.pickupTime).toBe('');
  });
});
