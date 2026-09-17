/**
 * Local scheduled notifications, with no server involved.
 *
 * Callers describe the reminders that *should* exist for a namespace, and
 * `syncReminders` makes the device match: new ones are scheduled, changed ones
 * are replaced in place (same id), and ones no longer wanted are cancelled.
 * That keeps callers declarative, so any feature can reuse it.
 */
import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
  TriggerType,
} from '@notifee/react-native';
import { Platform } from 'react-native';

import { REMINDER_CHANNEL_ID, registerNotificationChannels } from '@services/notifications/channels';

export interface ReminderSpec {
  /** Unique within its namespace; reusing an id updates that reminder. */
  id: string;
  fireAt: Date;
  title: string;
  body: string;
  /** Tapping the notification navigates to `data.route` when it's an app path. */
  data?: Record<string, string>;
}

export interface ReminderPermissionStatus {
  /** Notifications are blocked for the app, so nothing will appear. */
  notificationsBlocked: boolean;
  /** Android can't schedule exact alarms, so reminders may arrive a few minutes late. */
  exactAlarmsBlocked: boolean;
}

// Must match the icon installed by plugins/withNotificationIcon.js and the tint in display.ts.
const SMALL_ICON = 'ic_notification';
const NOTIFICATION_COLOR = '#1d4ed8';

function scopedId(namespace: string, id: string): string {
  return `${namespace}:${id}`;
}

async function exactAlarmsAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.android.alarm === AndroidNotificationSetting.ENABLED;
  } catch {
    return false;
  }
}

/** Replaces every scheduled reminder in `namespace` with `reminders`. Past times are skipped. */
export async function syncReminders(namespace: string, reminders: ReminderSpec[]): Promise<void> {
  try {
    await registerNotificationChannels();
    const now = Date.now();
    const wanted = reminders.filter((reminder) => reminder.fireAt.getTime() > now);
    const wantedIds = new Set(wanted.map((reminder) => scopedId(namespace, reminder.id)));

    const prefix = `${namespace}:`;
    const stale = (await notifee.getTriggerNotificationIds()).filter(
      (id) => id.startsWith(prefix) && !wantedIds.has(id),
    );
    if (stale.length) await notifee.cancelTriggerNotifications(stale);

    const exact = await exactAlarmsAllowed();
    for (const reminder of wanted) {
      await notifee.createTriggerNotification(
        {
          id: scopedId(namespace, reminder.id),
          title: reminder.title,
          body: reminder.body,
          data: reminder.data,
          android: {
            channelId: REMINDER_CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            smallIcon: SMALL_ICON,
            color: NOTIFICATION_COLOR,
            pressAction: { id: 'default', launchActivity: 'default' },
            autoCancel: true,
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: reminder.fireAt.getTime(),
          // Without the exact-alarm permission, WorkManager still delivers it, just less precisely.
          alarmManager: exact ? { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE } : undefined,
        },
      );
    }
  } catch (err) {
    console.warn(`[REMINDERS] Sync failed for ${namespace}`, err);
  }
}

/** Cancels every scheduled reminder in `namespace`. */
export async function cancelReminders(namespace: string): Promise<void> {
  try {
    const prefix = `${namespace}:`;
    const ids = (await notifee.getTriggerNotificationIds()).filter((id) => id.startsWith(prefix));
    if (ids.length) await notifee.cancelTriggerNotifications(ids);
  } catch {
    // Nothing scheduled, or notifee unavailable; either way nothing to cancel.
  }
}

export async function getReminderPermissionStatus(): Promise<ReminderPermissionStatus> {
  try {
    const settings = await notifee.getNotificationSettings();
    return {
      notificationsBlocked: settings.authorizationStatus === AuthorizationStatus.DENIED,
      exactAlarmsBlocked:
        Platform.OS === 'android' && settings.android.alarm !== AndroidNotificationSetting.ENABLED,
    };
  } catch {
    return { notificationsBlocked: false, exactAlarmsBlocked: false };
  }
}

export function openNotificationPermissionSettings(): Promise<void> {
  return notifee.openNotificationSettings();
}

export function openExactAlarmSettings(): Promise<void> {
  return notifee.openAlarmPermissionSettings();
}
