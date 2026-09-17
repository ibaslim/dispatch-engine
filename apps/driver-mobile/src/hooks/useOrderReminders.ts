import { useEffect, useMemo } from 'react';

import { useOrders } from '@contexts';
import {
  ORDER_REMINDER_NAMESPACE,
  cancelReminders,
  planOrderReminders,
  syncReminders,
} from '@services/reminders';
import { useReminderLead } from './useReminderLead';

/**
 * Keeps on-device reminders in step with the driver's orders and chosen lead
 * time. Mount once inside the signed-in area; unmounting (sign-out) clears them.
 */
export function useOrderReminders(): void {
  const { orders } = useOrders();
  const [lead] = useReminderLead();

  // Only fields that change a reminder; other order edits shouldn't reschedule.
  const signature = useMemo(
    () =>
      orders
        .map((o) =>
          [
            o.id,
            o.activity_status,
            o.pickup_planned_at,
            o.pickup_time_specified,
            o.delivery_planned_at,
            o.delivery_time_specified,
            o.pickup_address,
            o.delivery_address,
          ].join('~'),
        )
        .join('|'),
    [orders],
  );

  useEffect(() => {
    void syncReminders(ORDER_REMINDER_NAMESPACE, planOrderReminders(orders, lead));
    // `signature` stands in for `orders`, so edits that don't affect reminders don't reschedule.
  }, [signature, lead]);

  useEffect(() => () => void cancelReminders(ORDER_REMINDER_NAMESPACE), []);
}
