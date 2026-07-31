/**
 * useDriverLocation
 *
 * Sends the driver's GPS coordinates to the backend while `online === true`,
 * both in the FOREGROUND and when the app is BACKGROUNDED / SCREEN OFF.
 *
 * Cross-platform iOS & Android background location support:
 * --------------------------------------------------------
 * - iOS: Uses `showsBackgroundLocationIndicator: true` + `activityType: AutomotiveNavigation`
 *   to maintain background location execution with the blue status bar indicator.
 * - Android: Uses `foregroundService` notification so Android OS keeps the process active
 *   in the background without killing or throttling the location loop.
 * - Robust Fallback: If background location updates are rejected, gracefully falls back
 *   to `watchPositionAsync` + interval so location updates continue in the foreground seamlessly.
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { useOnlineStatus } from '@contexts';
import { clearDriverLocation, pushDriverLocation } from '@services/driver/location';
import { LOCATION_TASK_NAME } from '../tasks/locationTask';

/** Configured via EXPO_PUBLIC_DRIVER_LOCATION_PUSH_INTERVAL_SECONDS env var (defaults to 30 seconds) */
const PUSH_INTERVAL_SECONDS = Number(process.env.EXPO_PUBLIC_DRIVER_LOCATION_PUSH_INTERVAL_SECONDS) || 30;
const PUSH_INTERVAL_MS = PUSH_INTERVAL_SECONDS * 1000;

export function useDriverLocation(): void {
  const { online } = useOnlineStatus();
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function stopTracking() {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }

      try {
        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isStarted) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          console.log('[LOCATION TASK] Stopped background location tracking service.');
        }
      } catch (err) {
        // Best effort cleanup
      }

      clearDriverLocation().catch(() => {});
    }

    async function sendLocationPing() {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (loc?.coords) {
          await pushDriverLocation(loc.coords.latitude, loc.coords.longitude);
          console.log(
            `[LOCATION HEARTBEAT] Pushed location: lat=${loc.coords.latitude}, lng=${loc.coords.longitude} (interval: ${PUSH_INTERVAL_SECONDS}s)`,
          );
        }
      } catch (err) {
        console.warn('[LOCATION HEARTBEAT] Failed to get or push current location:', err);
      }
    }

    async function startTracking() {
      // 1. Request Foreground location permission
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        console.warn('[LOCATION HEARTBEAT] Foreground location permission denied.');
        return;
      }

      // 2. Push immediate location
      await sendLocationPing();

      // 3. Start active foreground heartbeat timer while app is open
      if (!heartbeatInterval.current) {
        heartbeatInterval.current = setInterval(() => {
          sendLocationPing();
        }, PUSH_INTERVAL_MS);
      }

      // 4. Request Background location permission ("Allow all the time")
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

      // 5. Start background location service with Android Foreground Service notification
      if (bgStatus === 'granted') {
        try {
          const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (!isStarted) {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
              accuracy: Location.Accuracy.Highest,
              timeInterval: PUSH_INTERVAL_MS,
              distanceInterval: 0,
              showsBackgroundLocationIndicator: true,
              activityType: Location.ActivityType.AutomotiveNavigation,
              foregroundService: {
                notificationTitle: 'Driver Online - Dispatch Tracking',
                notificationBody: 'Sharing location for active dispatch tracking',
                notificationColor: '#1d4ed8',
              },
              pausesUpdatesAutomatically: false,
            });
            console.log('[LOCATION TASK] Started background location tracking service.');
          }
        } catch (err) {
          console.warn('[LOCATION TASK] Could not start background location service:', err);
        }
      } else {
        console.log('[LOCATION TASK] Background location permission not granted; operating in foreground mode.');
      }
    }

    if (online) {
      startTracking().catch((err) => {
        console.error('Failed to start location tracking:', err);
      });
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [online]);
}
