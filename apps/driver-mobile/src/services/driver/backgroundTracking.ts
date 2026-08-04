/**
 * Lifecycle of the background location service.
 *
 * In the services layer rather than the hook because `AuthContext` needs it on
 * sign-out (hook → contexts would cycle), and because stopping must NOT be tied
 * to unmount — killing the app unmounts React while the service keeps running,
 * which is the point. Only going offline or signing out stops it.
 */
import * as Location from 'expo-location';

import { clearDriverLocation, releaseForegroundHeartbeat } from './location';

/** Defined here, not in the task module, so importers skip its registration side effect. */
export const LOCATION_TASK_NAME = 'BACKGROUND_DRIVER_LOCATION_TASK';

/** True when the OS is currently delivering background location updates. */
export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

/**
 * End the shift: stop background updates and drop the driver's position from
 * Redis so dispatchers stop seeing them on the map.
 */
export async function stopBackgroundTracking(): Promise<void> {
  releaseForegroundHeartbeat();

  try {
    if (await isBackgroundTrackingActive()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (__DEV__) console.log('[LOCATION] Stopped background location service.');
    }
  } catch {
    // Best-effort: a failure here must not block sign-out.
  }

  clearDriverLocation().catch(() => {});
}