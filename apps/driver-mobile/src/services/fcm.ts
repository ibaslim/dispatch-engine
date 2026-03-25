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
import { postWithAuth } from './api';

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

function getPlatform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
