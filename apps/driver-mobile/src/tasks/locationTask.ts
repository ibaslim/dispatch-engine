import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { pushDriverLocation } from '@services/driver/location';

export const LOCATION_TASK_NAME = 'BACKGROUND_DRIVER_LOCATION_TASK';

// Define top-level background location task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BG LOCATION TASK] Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations && locations.length > 0 ? locations[locations.length - 1] : null;
    if (latest && latest.coords) {
      try {
        await pushDriverLocation(latest.coords.latitude, latest.coords.longitude);
        console.log(`[BG LOCATION TASK] Sent location: lat=${latest.coords.latitude}, lng=${latest.coords.longitude}`);
      } catch (err) {
        console.warn('[BG LOCATION TASK] Failed to send background location:', err);
      }
    }
  }
});
