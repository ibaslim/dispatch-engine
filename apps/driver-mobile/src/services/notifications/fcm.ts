/**
 * Firebase Cloud Messaging integration for driver push notifications.
 *
 * Prerequisites:
 *   1. Add `google-services.json` (Android) to apps/driver-mobile/android/app/
 *   2. Add `GoogleService-Info.plist` (iOS) to apps/driver-mobile/ios/
 *   3. Set FIREBASE_PROJECT_ID etc. in .env.local (used server-side)
 *
 * The token is registered with the API after login so the backend can
 * send targeted push notifications for job assignments, etc.
 */

import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { postWithAuth } from '@services/api';

function getMessagingInstance() {
  try {
    return messaging();
  } catch (err) {
    console.warn('[FCM] Messaging module is unavailable. Skipping push setup.', err);
    return null;
  }
}

/**
 * Request notification permission and register FCM token with backend.
 * Call this after successful login.
 */
export async function registerFcmToken(): Promise<void> {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    return;
  }

  const authStatus = await messagingInstance.requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) {
    console.warn('[FCM] Notification permission not granted');
    return;
  }

  const fcmToken = await messagingInstance.getToken();
  if (!fcmToken) {
    console.warn('[FCM] Could not get FCM token');
    return;
  }

  try {
    await postWithAuth('/api/v1/drivers/me/push-token', {
      token: fcmToken,
      platform: getPlatform(),
    });
    console.log('[FCM] Push token registered');
  } catch (err) {
    console.error('[FCM] Failed to register push token:', err);
  }
}

/**
 * Handle foreground messages.
 * Returns unsubscribe function — call on component unmount.
 */
export function subscribeForegroundMessages(
  onMessage: (title: string, body: string) => void
): () => void {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    return () => {
      // No-op when messaging is unavailable.
    };
  }

  return messagingInstance.onMessage(async (remoteMessage) => {
    const title = remoteMessage.notification?.title ?? 'New notification';
    const body = remoteMessage.notification?.body ?? '';
    onMessage(title, body);
  });
}

/**
 * Handle background/quit state message tap.
 * Register once at app root.
 */
export function setupBackgroundHandler(): void {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    return;
  }

  messagingInstance.setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[FCM] Background message:', remoteMessage);
  });
}

/**
 * Deep-link to the relevant screen when a notification is tapped — both when the
 * app is opened from the background and from a cold start. Call once at the app
 * root. Job-assignment pushes are expected to carry `data.jobId`.
 * Returns an unsubscribe function.
 */
export function setupNotificationRouting(): () => void {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    return () => {
      // No-op when messaging is unavailable.
    };
  }

  const navigateFromMessage = (
    remoteMessage: { data?: Record<string, unknown> } | null
  ) => {
    const jobId = remoteMessage?.data?.jobId;
    if (typeof jobId === 'string' && jobId.length > 0) {
      router.push({ pathname: '/job/[id]', params: { id: jobId } });
    }
  };

  // Opened from background by tapping the notification.
  const unsubscribe = messagingInstance.onNotificationOpenedApp(navigateFromMessage);
  // Opened from a quit state by tapping the notification (cold start).
  messagingInstance.getInitialNotification().then(navigateFromMessage);

  return unsubscribe;
}

function getPlatform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
