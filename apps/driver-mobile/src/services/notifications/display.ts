/**
 * Drawing and clearing offer notifications.
 *
 * Android only: iOS draws its own alert from the APNs payload and takes the
 * buttons from the registered category, so calling displayNotification there
 * would produce a duplicate.
 */
import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';
import { AppState, Platform } from 'react-native';
import { PUSH_ACTIONS, PUSH_TYPES, isExpired, type ParsedPush } from '@dispatch/shared/contracts';

import { registerNotificationChannels } from './channels';

/**
 * White-on-transparent silhouette installed by `plugins/withNotificationIcon.js`.
 * Android discards a small icon's colours and keeps only its alpha, so pointing
 * this at the (edge-to-edge opaque) launcher icon draws a solid white square.
 */
const SMALL_ICON = 'ic_notification';
/** Tint drawn behind the silhouette. Keep in sync with `ICON_COLOR` in the plugin. */
const NOTIFICATION_COLOR = '#1d4ed8';

/** Notification id = order id, so a duplicate delivery updates instead of stacking. */
export async function displayOffer(push: ParsedPush): Promise<void> {
  if (push.silent || isExpired(push)) return;

  const isForeground = AppState.currentState === 'active';

  // iOS draws its own alert from the APNs payload — but not while foregrounded,
  // so notifee has to draw that case and only that case.
  if (Platform.OS !== 'android' && !isForeground) return;

  // Pusher already updates the Available tab live, so a foreground offer is
  // noise. A direct assignment still buzzes — it can land on any screen.
  if (isForeground && push.type !== PUSH_TYPES.ORDER_ASSIGNED) return;

  await registerNotificationChannels();

  const timeoutAfter = push.expiresAt
    ? Math.max(1000, push.expiresAt.getTime() - Date.now())
    : undefined;

  await notifee.displayNotification({
    id: push.orderId,
    title: push.title,
    body: push.body,
    data: { route: push.route, order_id: push.orderId, type: push.type },
    android: {
      channelId: push.category,
      importance: AndroidImportance.HIGH,
      smallIcon: SMALL_ICON,
      color: NOTIFICATION_COLOR,
      pressAction: { id: PUSH_ACTIONS.DETAILS, launchActivity: 'default' },
      // Self-clears when the offer window closes, so nobody taps a dead screen.
      timeoutAfter,
      autoCancel: true,
      style: { type: AndroidStyle.BIGTEXT, text: push.body },
      actions: [
        { title: 'Dismiss', pressAction: { id: PUSH_ACTIONS.DISMISS } },
        {
          title: 'Details',
          pressAction: { id: PUSH_ACTIONS.DETAILS, launchActivity: 'default' },
        },
      ],
    },
    // Buttons come from the category registered at boot.
    ios: { categoryId: push.category },
  });
}

export async function cancelOffer(orderId: string): Promise<void> {
  try {
    await notifee.cancelNotification(orderId);
  } catch {
    // Already gone; nothing to clear.
  }
}