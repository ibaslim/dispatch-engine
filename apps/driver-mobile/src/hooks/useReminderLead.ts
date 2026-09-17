import { useSyncExternalStore } from 'react';

import {
  getReminderLead,
  setReminderLead,
  subscribeReminderLead,
  type ReminderLead,
} from '@services/reminders';

/** The saved reminder lead time, shared by Settings and the scheduler without a provider. */
export function useReminderLead(): [ReminderLead, (lead: ReminderLead) => void] {
  const lead = useSyncExternalStore(subscribeReminderLead, getReminderLead);
  return [lead, setReminderLead];
}
