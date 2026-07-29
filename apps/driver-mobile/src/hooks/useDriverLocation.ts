/**
 * useDriverLocation
 *
 * Sends the driver's GPS coordinates to the backend every 5 minutes while
 * `online === true`.  On going offline it fires a DELETE to remove the stale
 * entry from Redis immediately rather than waiting for the 15-minute TTL.
 *
 * Design notes
 * ------------
 * - Uses `Location.watchPositionAsync` so the OS handles position updates
 *   efficiently — we just cache the latest fix and flush it on the 5-minute
 *   interval rather than requesting a fresh GPS lock every time.
 * - The interval and the watch subscription are cleaned up together whenever
 *   `online` flips to false, preventing any dangling timers or listeners.
 * - Failures are swallowed silently: a missed heartbeat is not fatal (the
 *   previous value in Redis is still valid for up to 15 minutes), and
 *   hammering the user with errors for a background task is bad UX.
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';

import { useOnlineStatus } from '@contexts';
import { pushDriverLocation, clearDriverLocation } from '@services/driver/location';

/** Must match LOCATION_PUSH_INTERVAL_SECONDS in driver_location_service.py */
const PUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useDriverLocation(): void {
  const { online } = useOnlineStatus();
  // Cache the latest GPS fix so the interval flush does not need to wait for
  // a fresh acquisition on every tick.
  const latestCoords = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!online) {
      // Driver went offline — evict the Redis key immediately.
      clearDriverLocation().catch(() => {
        // Best-effort: TTL will clean it up within 15 minutes regardless.
      });
      return;
    }

    let watchSub: Location.LocationSubscription | null = null;
    let pushInterval: ReturnType<typeof setInterval> | null = null;

    async function start() {
      const firedInitial = { current: false };

      // Subscribe to position updates from the OS location provider.
      // `distanceFilter: 0` means any movement triggers an update so our
      // cached fix is always the most recent available.
      watchSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30_000, // refresh the OS fix at most every 30 s
          distanceInterval: 0,
        },
        ({ coords }) => {
          latestCoords.current = { lat: coords.latitude, lng: coords.longitude };

          // Fire an immediate push on the very first GPS fix so Redis is
          // populated the moment the driver goes online, not 5 min later.
          if (!firedInitial.current) {
            firedInitial.current = true;
            pushDriverLocation(coords.latitude, coords.longitude).catch(() => {
              // Swallow — non-fatal.
            });
          }
        },
      );

      // Push the cached coordinates on each interval tick.
      pushInterval = setInterval(() => {
        const coords = latestCoords.current;
        if (coords) {
          pushDriverLocation(coords.lat, coords.lng).catch(() => {
            // Swallow — a missed heartbeat is not fatal.
          });
        }
      }, PUSH_INTERVAL_MS);
    }

    start().catch(() => {
      // Location services unavailable — OnlineStatusContext will catch this
      // through its own interval check and force the driver offline.
    });

    return () => {
      watchSub?.remove();
      if (pushInterval !== null) clearInterval(pushInterval);
    };
  }, [online]);
}
