/**
 * Which order reminders should exist right now. Pure, so it's testable without
 * notifee: `syncReminders` does the scheduling.
 */
import type { ActivityStatus, DriverOrder } from '@dispatch/shared/contracts';

import type { ReminderSpec } from './scheduler';

export const ORDER_REMINDER_NAMESPACE = 'order-reminder';

/** A date-only stop has no time to count back from, so it reminds at this hour that morning. */
export const DATE_ONLY_REMINDER_HOUR = 8;

const AWAITING_PICKUP: ActivityStatus[] = ['driver_not_assigned', 'pickup_initiated'];
const AWAITING_DROP: ActivityStatus[] = ['picked_up', 'delivery_initiated', 'delivery_in_progress'];

/** Planned times are wall-clock with no zone; read them in the device's zone. */
function localDate(plannedAt: string, hour: number, minute: number): Date {
  const [year, month, day] = plannedAt.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function leadLabel(minutes: number): string {
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function planOrderReminders(
  orders: DriverOrder[],
  leadMinutes: number,
  now = new Date(),
): ReminderSpec[] {
  if (leadMinutes <= 0) return [];

  const reminders: ReminderSpec[] = [];
  for (const order of orders) {
    let kind: 'pickup' | 'drop';
    let plannedAt: string;
    let timeSpecified: boolean;
    let address: string;

    if (AWAITING_PICKUP.includes(order.activity_status)) {
      kind = 'pickup';
      plannedAt = order.pickup_planned_at;
      timeSpecified = order.pickup_time_specified;
      address = order.pickup_address;
    } else if (AWAITING_DROP.includes(order.activity_status)) {
      kind = 'drop';
      plannedAt = order.delivery_planned_at;
      timeSpecified = order.delivery_time_specified;
      address = order.delivery_address;
    } else {
      continue;
    }
    if (!plannedAt) continue;

    const stop = kind === 'pickup' ? 'Pickup' : 'Drop';
    const label = order.order_number ? `Order ${order.order_number}` : 'Your order';
    let fireAt: Date;
    let title: string;

    if (timeSpecified) {
      const due = localDate(plannedAt, Number(plannedAt.slice(11, 13)), Number(plannedAt.slice(14, 16)));
      fireAt = new Date(due.getTime() - leadMinutes * 60_000);
      title = `${stop} in ${leadLabel(leadMinutes)}`;
    } else {
      fireAt = localDate(plannedAt, DATE_ONLY_REMINDER_HOUR, 0);
      title = `${stop} today`;
    }

    // Too late to warn ahead of time; don't buzz after the fact.
    if (fireAt.getTime() <= now.getTime()) continue;

    reminders.push({
      id: `${order.id}:${kind}`,
      fireAt,
      title,
      body: address ? `${label} at ${address}` : label,
      data: { route: `/order/${order.id}`, order_id: order.id, type: 'order_reminder' },
    });
  }
  return reminders;
}
