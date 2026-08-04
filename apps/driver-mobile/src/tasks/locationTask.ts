import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {
  LOCATION_TASK_NAME,
  foregroundHeartbeatActive,
  pushDriverLocation,
} from '@services/driver';

export { LOCATION_TASK_NAME };

// Background location task. Must be defined at module scope so a headless
// relaunch re-registers it.
//
// While the app is alive this shares a JS context with the foreground tracker,
// so it stands down unless the heartbeat lease has lapsed. Once the app is
// killed the lease expires and this becomes the only reporter.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BG LOCATION TASK] Background location error:', error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations?.length ? locations[locations.length - 1] : null;
  if (!latest?.coords) return;

  if (foregroundHeartbeatActive()) {
    return; // The in-app tracker is already reporting this fix.
  }

  try {
    const sent = await pushDriverLocation(latest.coords.latitude, latest.coords.longitude, {
      timestamp: latest.timestamp,
    });
    if (__DEV__ && sent) {
      console.log(
        `[BG LOCATION TASK] Sent location: lat=${latest.coords.latitude}, lng=${latest.coords.longitude}`,
      );
    }
  } catch (err) {
    console.warn('[BG LOCATION TASK] Failed to send background location:', err);
  }
});