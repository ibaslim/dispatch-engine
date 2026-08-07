/**
 * Android channel + iOS category registration. Idempotent; call once at boot.
 *
 * Both must exist *before* a notification arrives. An unregistered iOS category
 * renders the alert with no buttons and no error anywhere — so registration
 * logs on failure rather than failing silently.
 */
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { Platform } from 'react-native';
import {
  PUSH_ACTIONS,
  PUSH_CATEGORY_OFFER,
} from '@dispatch/shared/contracts';

let registered = false;

export async function registerNotificationChannels(): Promise<void> {
  if (registered) return;

  try {
    if (Platform.OS === 'android') {
      // Importance is immutable once the channel exists on a device, which is
      // why the id is versioned — raising it later needs a new id.
      await notifee.createChannel({
        id: PUSH_CATEGORY_OFFER,
        name: 'Delivery offers',
        description: 'New jobs available to accept',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
      });
    } else {
      await notifee.setNotificationCategories([
        {
          id: PUSH_CATEGORY_OFFER,
          actions: [
            { id: PUSH_ACTIONS.DISMISS, title: 'Dismiss', destructive: true },
            { id: PUSH_ACTIONS.DETAILS, title: 'Details', foreground: true },
          ],
        },
      ]);
    }

    registered = true;
    if (__DEV__) console.log('[PUSH] Channel/category registered:', PUSH_CATEGORY_OFFER);
  } catch (err) {
    console.warn('[PUSH] Channel/category registration failed', err);
  }
}