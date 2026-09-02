/**
 * Shift-state copy, shared by every screen that can start or explain a shift.
 *
 * Kept in one place so Home and Available never tell the driver two different
 * stories about the same requirement.
 */
import type { GoOnlineResult, OfflineReason } from '@contexts';

/** Toast shown when going online was refused. */
export function goOnlineBlockedMessage(result: Exclude<GoOnlineResult, 'online'>): string {
  switch (result) {
    case 'permission':
      return 'Allow location access in your device settings to go online.';
    case 'services_disabled':
      return 'Please turn on your device location services to go online.';
    case 'background_permission':
      return 'Set location access to “Allow all the time” to go online.';
  }
}

/** Body copy for the offline status card, by why the driver is offline. */
export function offlineReasonCopy(reason: OfflineReason): string {
  switch (reason) {
    case 'permission':
      return 'Location access was denied or lost, so you were taken offline. Allow location to go back online.';
    case 'services_disabled':
      return 'Device location services are turned off, so you were taken offline. Turn on location to go back online.';
    case 'background_permission':
      return 'Going online needs always-on location, so tracking continues once your screen is off. Set location access to “Allow all the time”.';
    case 'manual':
      return 'You are not receiving new orders. Go online to start your shift.';
  }
}

/** Whether the reason is fixed in system Settings rather than by a prompt. */
export function needsSettingsTrip(reason: OfflineReason): boolean {
  return reason === 'permission' || reason === 'background_permission';
}