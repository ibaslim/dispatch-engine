/**
 * useDriverLocation
 *
 * Sends the driver's latest known GPS coordinates to the backend every 5 seconds
 * while `online === true` in the foreground. Background updates are delegated to
 * the native location service and are subject to OS scheduling.
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';

import { useOnlineStatus } from '@contexts';
import { clearDriverLocation, pushDriverLocation } from '@services/driver/location';
import { LOCATION_TASK_NAME } from '../tasks/locationTask';

/** Configured via EXPO_PUBLIC_DRIVER_LOCATION_PUSH_INTERVAL_SECONDS env var (defaults to 5 seconds). */
const PUSH_INTERVAL_SECONDS = Number(process.env.EXPO_PUBLIC_DRIVER_LOCATION_PUSH_INTERVAL_SECONDS) || 5;
const PUSH_INTERVAL_MS = PUSH_INTERVAL_SECONDS * 1000;

export function useDriverLocation(): void {
  const { online } = useOnlineStatus();
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestCoords = useRef<Location.LocationObjectCoords | null>(null);

  useEffect(() => {
    function removeWatcher() {
      if (watchSubscription.current) {
        watchSubscription.current.remove();
        watchSubscription.current = null;
      }
    }

    function removeHeartbeat() {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }
    }

    function pushLatestLocation() {
      const coords = latestCoords.current;
      if (!coords) {
        return;
      }
      pushDriverLocation(coords.latitude, coords.longitude).catch(() => {});
    }

    async function stopTracking() {
      removeWatcher();
      removeHeartbeat();
      latestCoords.current = null;

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

    async function startTracking() {
      // 1. Request Foreground location permission
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        console.warn('[LOCATION HEARTBEAT] Foreground location permission denied.');
        return;
      }

      const lastKnownLocation = await Location.getLastKnownPositionAsync();
      if (lastKnownLocation?.coords) {
        latestCoords.current = lastKnownLocation.coords;
        pushLatestLocation();
      }

      // 2. Start live location watcher and keep the latest fix cached.
      removeWatcher();
      watchSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: PUSH_INTERVAL_MS,
          distanceInterval: 0,
        },
        (loc) => {
          if (loc?.coords) {
            latestCoords.current = loc.coords;
            pushLatestLocation();
            console.log(
              `[LOCATION WATCHER] Streamed location: lat=${loc.coords.latitude}, lng=${loc.coords.longitude} (interval: ${PUSH_INTERVAL_SECONDS}s)`,
            );
          }
        },
      );

      removeHeartbeat();
      heartbeatInterval.current = setInterval(pushLatestLocation, PUSH_INTERVAL_MS);

      // 3. Request Background location permission ("Allow all the time").
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

      // 4. Start background TaskManager for lock screen/background support.
      if (bgStatus === 'granted') {
        try {
          const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (!isStarted) {
            const taskOptions: Location.LocationTaskOptions & { stopOnTerminate?: boolean } = {
              accuracy: Location.Accuracy.High,
              timeInterval: PUSH_INTERVAL_MS,
              distanceInterval: 0,
              deferredUpdatesInterval: PUSH_INTERVAL_MS,
              deferredUpdatesDistance: 0,
              showsBackgroundLocationIndicator: true,
              activityType: Location.ActivityType.AutomotiveNavigation,
              foregroundService: {
                notificationTitle: 'Driver Online - Dispatch Tracking',
                notificationBody: 'Sharing location for active dispatch tracking',
                notificationColor: '#1d4ed8',
              },
              pausesUpdatesAutomatically: false,
              stopOnTerminate: false,
            };

            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions);
            console.log('[LOCATION TASK] Started background location tracking service.');
          }
        } catch (err) {
          console.warn('[LOCATION TASK] Could not start background location service:', err);
        }
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
