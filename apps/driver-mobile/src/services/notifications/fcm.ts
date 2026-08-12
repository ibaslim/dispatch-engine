/**
 * FCM token lifecycle: permission, registration, refresh, revoke.
 *
 * Display and routing live in `display.ts` / `handlers.ts`.
 *
 * Permission is requested at first go-online, not at login: Android 13+ gives
 * exactly one POST_NOTIFICATIONS prompt, and a denial can only be undone in
 * system settings. Spending it on a login screen, where the driver has no
 * context for why offers need notifications, gets it denied permanently.
 */
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { postWithAuth } from '@services/api';

const LAST_REGISTERED_KEY = 'driver.push.token_registered_at';
const LAST_TOKEN_KEY = 'driver.push.token';

/** Re-register a token this old even if nothing signalled a refresh. */
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Cap on the sign-out revoke call; logging out must never hang. */
const REVOKE_TIMEOUT_MS = 8_000;

function getMessaging() {
  try {
    return messaging();
  } catch (err) {
    console.warn('[PUSH] Messaging unavailable; skipping push setup.', err);
    return null;
  }
}

function platform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export async function hasNotificationPermission(): Promise<boolean> {
  const instance = getMessaging();
  if (!instance) return false;
  const status = await instance.hasPermission();
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
}

async function sendToken(token: string): Promise<void> {
  await postWithAuth('/api/v1/drivers/me/push-token', { token, platform: platform() });
  await AsyncStorage.multiSet([
    [LAST_TOKEN_KEY, token],
    [LAST_REGISTERED_KEY, String(Date.now())],
  ]);
}

/**
 * Request permission if needed, then register this device.
 * Returns false when the driver declined — the caller decides what to say.
 */
export async function registerFcmToken(): Promise<boolean> {
  const instance = getMessaging();
  if (!instance) return false;

  try {
    if (!(await hasNotificationPermission())) {
      const status = await instance.requestPermission();
      const granted =
        status === messaging.AuthorizationStatus.AUTHORIZED ||
        status === messaging.AuthorizationStatus.PROVISIONAL;
      if (!granted) {
        console.warn('[PUSH] Notification permission not granted');
        return false;
      }
    }

    const token = await instance.getToken();
    if (!token) return false;

    await sendToken(token);
    if (__DEV__) console.log('[PUSH] Token registered');
    return true;
  } catch (err) {
    console.error('[PUSH] Token registration failed:', err);
    return false;
  }
}

/**
 * Re-register if the stored token is stale or has changed.
 * Cheap insurance against a missed `onTokenRefresh`.
 */
export async function refreshFcmTokenIfStale(): Promise<void> {
  const instance = getMessaging();
  if (!instance || !(await hasNotificationPermission())) return;

  try {
    const [[, storedToken], [, registeredAt]] = await AsyncStorage.multiGet([
      LAST_TOKEN_KEY,
      LAST_REGISTERED_KEY,
    ]);
    const token = await instance.getToken();
    if (!token) return;

    const age = Date.now() - Number(registeredAt ?? 0);
    if (token !== storedToken || Number.isNaN(age) || age > REREGISTER_AFTER_MS) {
      await sendToken(token);
    }
  } catch {
    // Best-effort; the next foreground tries again.
  }
}

/** Keep the server in step when FCM rotates the token (restore, reinstall). */
export function subscribeTokenRefresh(): () => void {
  const instance = getMessaging();
  if (!instance) return () => {};
  return instance.onTokenRefresh((token) => {
    sendToken(token).catch((err) => console.error('[PUSH] Token refresh failed:', err));
  });
}

/**
 * Stop pushes to this device on sign-out, so a logged-out phone goes quiet.
 * Must run before the session is cleared — the call needs the access token.
 */
export async function revokeFcmToken(): Promise<void> {
  const instance = getMessaging();
  if (!instance) return;

  // Bounded: sign-out runs on this path, and a driver must always be able to
  // log out — a stalled network must not hold them in a signed-in session.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS);

  try {
    const token = (await AsyncStorage.getItem(LAST_TOKEN_KEY)) ?? (await instance.getToken());
    if (token) {
      await postWithAuth(
        '/api/v1/drivers/me/push-token/revoke',
        { token, platform: platform() },
        controller.signal,
      );
    }
  } catch {
    // Sign-out must not be blocked by a failed revoke. The server still reaps
    // the token when FCM reports it dead.
  } finally {
    clearTimeout(timeout);
    // Always clear locally, so a re-login re-registers rather than trusting a
    // stale token the server may already have dropped.
    await AsyncStorage.multiRemove([LAST_TOKEN_KEY, LAST_REGISTERED_KEY]).catch(() => {});
  }
}