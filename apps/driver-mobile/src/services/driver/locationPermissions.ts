/**
 * Location permission rules, in one place.
 *
 * Background location defeats a naive `requestBackgroundPermissionsAsync()`:
 * Android 11+ never shows a dialog (Settings is the only path), and on iOS
 * "Keep Only While Using" reads as a denial but is permanent. So the result is
 * three-state — granted / ask again / go to Settings — not a boolean.
 */
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

export type BackgroundPermissionState =
  /** Background updates are allowed — the foreground service can start. */
  | 'granted'
  /** Not granted, and only a trip to system Settings can change that. */
  | 'needs-settings'
  /** Not granted, but asking again is still possible. */
  | 'denied';

/** True on Android versions where background location cannot be prompted for. */
function isSettingsOnlyAndroid(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 30;
}

/** Current foreground permission, without prompting. */
export async function getForegroundState(): Promise<boolean> {
  const { granted } = await Location.getForegroundPermissionsAsync();
  return granted;
}

/** Resolve background permission, prompting only where a prompt can succeed. */
export async function ensureBackgroundPermission(): Promise<BackgroundPermissionState> {
  try {
    const current = await Location.getBackgroundPermissionsAsync();
    if (current.granted) return 'granted';

    // Android 11+: a prompt is guaranteed to fail, so don't fire one — send the
    // driver to Settings instead.
    if (isSettingsOnlyAndroid()) return 'needs-settings';

    if (!current.canAskAgain) return 'needs-settings';

    const result = await Location.requestBackgroundPermissionsAsync();
    if (result.granted) return 'granted';
    return result.canAskAgain ? 'denied' : 'needs-settings';
  } catch {
    return 'denied';
  }
}

/** Read background permission without prompting (for status display). */
export async function getBackgroundState(): Promise<BackgroundPermissionState> {
  try {
    const current = await Location.getBackgroundPermissionsAsync();
    if (current.granted) return 'granted';
    if (isSettingsOnlyAndroid() || !current.canAskAgain) return 'needs-settings';
    return 'denied';
  } catch {
    return 'denied';
  }
}

/** Open this app's system settings page so the driver can fix a permission. */
export async function openLocationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Nothing actionable if the OS refuses to open Settings.
  }
}

/**
 * Settings path to the always-on location toggle, as segments so the UI can
 * draw chevron glyphs between them. A literal "→" is unsafe — it's missing from
 * the default Android font and renders as a fallback character.
 */
export function backgroundPermissionPath(): string[] {
  return Platform.OS === 'android'
    ? ['Settings', 'Permissions', 'Location', 'Allow all the time']
    : ['Settings', 'Location', 'Always'];
}

/** The sentence that follows the breadcrumb — why the driver should care. */
export function backgroundPermissionHint(): string {
  return 'so tracking continues when your screen is off.';
}