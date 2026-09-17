import type { DriverOrder } from '@dispatch/shared/contracts';

import { DATE_ONLY_REMINDER_HOUR, planOrderReminders } from '../orderReminders';

// 20 Sep 2026, 12:00 in the device's zone.
const NOW = new Date(2026, 8, 20, 12, 0);

function order(overrides: Partial<DriverOrder>): DriverOrder {
  return {
    id: 'order-1',
    order_number: 'ORD20092601',
    activity_status: 'pickup_initiated',
    pickup_address: '1420 Robson St',
    pickup_planned_at: '2026-09-20T14:30:00',
    pickup_time_specified: true,
    delivery_address: '305 Hastings St',
    delivery_planned_at: '2026-09-20T16:00:00',
    delivery_time_specified: true,
    ...overrides,
  } as DriverOrder;
}

describe('planOrderReminders', () => {
  it('reminds the chosen time before a timed pickup', () => {
    const [reminder] = planOrderReminders([order({})], 30, NOW);

    expect(reminder.fireAt).toEqual(new Date(2026, 8, 20, 14, 0));
    expect(reminder.title).toBe('Pickup in 30 min');
    expect(reminder.body).toBe('Order ORD20092601 at 1420 Robson St');
    expect(reminder.data).toEqual({ route: '/order/order-1', order_id: 'order-1', type: 'order_reminder' });
  });

  it('switches to the drop once the parcel is picked up', () => {
    const [reminder] = planOrderReminders([order({ activity_status: 'picked_up' })], 60, NOW);

    expect(reminder.id).toBe('order-1:drop');
    expect(reminder.fireAt).toEqual(new Date(2026, 8, 20, 15, 0));
    expect(reminder.title).toBe('Drop in 1 hour');
  });

  it('reminds a date-only stop on the morning of its day', () => {
    const [reminder] = planOrderReminders(
      [order({ pickup_planned_at: '2026-09-21T00:00:00', pickup_time_specified: false })],
      30,
      NOW,
    );

    expect(reminder.fireAt).toEqual(new Date(2026, 8, 21, DATE_ONLY_REMINDER_HOUR, 0));
    expect(reminder.title).toBe('Pickup today');
  });

  it('skips a reminder whose time has already passed', () => {
    expect(planOrderReminders([order({ pickup_planned_at: '2026-09-20T12:15:00' })], 30, NOW)).toEqual([]);
  });

  it('supports a custom lead of a few minutes, for testing', () => {
    const [reminder] = planOrderReminders([order({})], 2, NOW);

    expect(reminder.fireAt).toEqual(new Date(2026, 8, 20, 14, 28));
    expect(reminder.title).toBe('Pickup in 2 min');
  });

  it('labels a lead that is not a whole number of hours in minutes', () => {
    expect(planOrderReminders([order({})], 90, NOW)[0].title).toBe('Pickup in 90 min');
  });

  it('schedules nothing when reminders are off', () => {
    expect(planOrderReminders([order({})], 0, NOW)).toEqual([]);
  });

  it('ignores delivered orders', () => {
    expect(planOrderReminders([order({ activity_status: 'delivered' })], 30, NOW)).toEqual([]);
  });
});
