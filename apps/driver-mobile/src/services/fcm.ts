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
import { fetchWithAuth } from './api';

/**
 * Request notification permission and register FCM token with backend.
 * Call this after successful login.
 */
export async function registerFcmToken(): Promise<void> {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) {
    console.warn('[FCM] Notification permission not granted');
    return;
  }

  const fcmToken = await messaging().getToken();
  if (!fcmToken) {
    console.warn('[FCM] Could not get FCM token');
    return;
  }

  try {
    await fetchWithAuth('/api/v1/drivers/me/push-token', {
      method: 'POST',
      body: JSON.stringify({ token: fcmToken, platform: getPlatform() }),
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
  return messaging().onMessage(async (remoteMessage) => {
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
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[FCM] Background message:', remoteMessage);
  });
}

function getPlatform(): 'android' | 'ios' {
  const { Platform } = require('react-native') as { Platform: { OS: string } };
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
