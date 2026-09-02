/**
 * Notification event routing.
 *
 * Two entry points with very different lifetimes:
 *
 * - `registerBackgroundHandlers()` runs at module scope from `index.js`, before
 *   any React tree exists. This is the killed-app path — registering it inside a
 *   component would silently break backgrounded/killed delivery.
 * - `setupForegroundRouting()` runs from the root layout, where the router is
 *   mounted.
 *
 * Navigation never happens in the background handler. A "Details" press just
 * launches the activity; the route is then picked up at startup from
 * `getInitialNotification`. That keeps expo-router out of the headless context.
 */
import notifee, { EventType, type Event } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { router } from 'expo-router';
import {
  PUSH_ACTIONS,
  PUSH_TYPES,
  parsePushPayload,
  type ParsedPush,
} from '@dispatch/shared/contracts';

import { cancelOffer, displayOffer } from './display';
import { registerNotificationChannels } from './channels';

/** Cold-start route, parked until the authenticated area can navigate. */
let pendingRoute: string | null = null;
let onPending: (() => void) | null = null;

function navigate(route: string): void {
  if (!route.startsWith('/')) return;
  router.push(route as never);
}

/** Park a cold-start route. Pushing now is lost when the auth guard mounts. */
function parkRoute(route: string): void {
  if (!route.startsWith('/')) return;
  pendingRoute = route;
  onPending?.();
}

/** Route the app was launched into by a notification tap, if any. */
export function consumePendingRoute(): string | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}

/** Fires when a route is parked, so a late-resolving tap still routes. */
export function subscribePendingRoute(listener: () => void): () => void {
  onPending = listener;
  return () => {
    if (onPending === listener) onPending = null;
  };
}

/** Apply a payload: display it, or clear what it revokes. */
async function handlePush(push: ParsedPush): Promise<void> {
  if (push.type === PUSH_TYPES.OFFER_REVOKED) {
    await cancelOffer(push.orderId);
    return;
  }
  await displayOffer(push);
}

function getMessaging() {
  try {
    return messaging();
  } catch {
    return null;
  }
}

/**
 * Register the handlers that must exist before React does.
 * Call once, at module scope, from `index.js`.
 */
export function registerBackgroundHandlers(): void {
  const instance = getMessaging();

  instance?.setBackgroundMessageHandler(async (remoteMessage) => {
    const push = parsePushPayload(remoteMessage?.data);
    // Unknown type or version: ignore, never throw. A newer server will send
    // types this build has never heard of.
    if (push) await handlePush(push);
  });

  notifee.onBackgroundEvent(async ({ type, detail }: Event) => {
    const actionId = detail.pressAction?.id;
    const orderId = detail.notification?.id;

    if (type === EventType.ACTION_PRESS && actionId === PUSH_ACTIONS.DISMISS && orderId) {
      await cancelOffer(orderId);
    }
    // DETAILS launches the activity; routing happens from getInitialNotification.
  });
}

/**
 * Foreground events + cold-start routing. Call from the root layout.
 * Returns an unsubscribe function.
 */
export function setupForegroundRouting(): () => void {
  void registerNotificationChannels();

  const instance = getMessaging();

  // Tapped while the app was backgrounded but alive: router is already mounted.
  const unsubscribeOpened = instance?.onNotificationOpenedApp((remoteMessage) => {
    const push = parsePushPayload(remoteMessage?.data);
    if (push?.route) navigate(push.route);
  });

  // Cold start via an OS-drawn notification (iOS).
  instance?.getInitialNotification().then((remoteMessage) => {
    const push = parsePushPayload(remoteMessage?.data);
    if (push?.route) parkRoute(push.route);
  });

  // Cold start via a notifee-drawn notification (Android).
  notifee.getInitialNotification().then((initial) => {
    if (!initial) return;
    const route = initial.notification.data?.route;
    if (typeof route === 'string') parkRoute(route);
  });

  // Data messages arriving while the app is open. `displayOffer` decides what
  // is worth drawing in the foreground; revokes still clear the tray.
  const unsubscribeMessage = instance?.onMessage(async (remoteMessage) => {
    const push = parsePushPayload(remoteMessage?.data);
    if (push) await handlePush(push);
  });

  const unsubscribeForeground = notifee.onForegroundEvent(({ type, detail }) => {
    const actionId = detail.pressAction?.id;
    const orderId = detail.notification?.id;

    if (type === EventType.ACTION_PRESS && actionId === PUSH_ACTIONS.DISMISS && orderId) {
      void cancelOffer(orderId);
      return;
    }
    if (type === EventType.PRESS || actionId === PUSH_ACTIONS.DETAILS) {
      const route = detail.notification?.data?.route;
      if (typeof route === 'string') navigate(route);
    }
  });

  return () => {
    unsubscribeOpened?.();
    unsubscribeMessage?.();
    unsubscribeForeground();
  };
}