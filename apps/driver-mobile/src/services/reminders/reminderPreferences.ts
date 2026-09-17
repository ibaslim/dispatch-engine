/**
 * How far ahead of a stop the driver wants a reminder. Stored on the device only;
 * the server never sees it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'dispatch.reminder_lead_minutes';

/** Minutes before a timed stop; 0 turns reminders off. */
export type ReminderLead = number;

/** The choices offered to every driver. Test builds can also enter any whole number of minutes. */
export const REMINDER_LEAD_OPTIONS: readonly ReminderLead[] = [0, 15, 30, 60, 120];

export const DEFAULT_REMINDER_LEAD: ReminderLead = 30;

/** A day ahead is the furthest a custom lead can go. */
export const MAX_REMINDER_LEAD: ReminderLead = 24 * 60;

let current: ReminderLead = DEFAULT_REMINDER_LEAD;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function isValidReminderLead(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_REMINDER_LEAD;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Reads the saved choice once; later calls reuse the same load. */
export function loadReminderLead(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const saved = raw === null ? NaN : Number(raw);
        if (isValidReminderLead(saved) && saved !== current) {
          current = saved;
          notify();
        }
      })
      .catch(() => undefined);
  }
  return loaded;
}

export function getReminderLead(): ReminderLead {
  return current;
}

export function setReminderLead(lead: ReminderLead): void {
  if (!isValidReminderLead(lead) || lead === current) return;
  current = lead;
  notify();
  AsyncStorage.setItem(STORAGE_KEY, String(lead)).catch(() => undefined);
}

export function subscribeReminderLead(listener: () => void): () => void {
  listeners.add(listener);
  void loadReminderLead();
  return () => {
    listeners.delete(listener);
  };
}

export function formatReminderLead(lead: ReminderLead): string {
  if (lead === 0) return 'Off';
  if (lead < 60 || lead % 60 !== 0) return `${lead} min`;
  const hours = lead / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
