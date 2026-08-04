/**
 * Device-level conditions that decide whether background tracking survives a
 * real shift, rather than merely starting. Neither is fixable in app logic.
 */
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Asked-once marker so a driver isn't nagged on every shift. */
const BATTERY_PROMPT_KEY = 'driver.pref.battery_prompt_shown';

/** Android 13 (API 33) is where notifications became a runtime permission. */
const ANDROID_13 = 33;

/**
 * Request POST_NOTIFICATIONS where the platform needs it (Android 13+).
 * Without it the foreground-service notification is suppressed, leaving the
 * driver tracked with no indicator — and OEM ROMs kill invisible services.
 * Never throws; not worth blocking a shift over.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < ANDROID_13) {
    return true;
  }

  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) {
      return true;
    }
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Point the driver at the battery-optimisation exemption list, once. Doze and
 * OEM battery managers kill foreground services regardless of type; only the
 * user can grant the exemption.
 *
 * Opens the list, not the one-tap dialog: that needs a `package:` data URI
 * `Linking.sendIntent` can't attach, so it would cost an extra dependency plus
 * a Play-reviewed permission. Returns true if the prompt was shown.
 */
export async function promptBatteryExemptionOnce(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    if (await AsyncStorage.getItem(BATTERY_PROMPT_KEY)) {
      return false;
    }
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    await AsyncStorage.setItem(BATTERY_PROMPT_KEY, 'true');
    return true;
  } catch {
    // Some ROMs don't expose the screen; nothing actionable if so.
    return false;
  }
}

/** Let the driver re-open the battery screen on demand, ignoring the once-flag. */
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    // Fall back to the app's own settings page.
    await Linking.openSettings().catch(() => {});
  }
}