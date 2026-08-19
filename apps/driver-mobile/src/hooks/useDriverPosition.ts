import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { useOnlineStatus } from '@contexts';
import { haversineKm, type Coords } from '@utils/distance';

/** How often the cached fix is re-read; the tracker refreshes it every ~5s. */
const POLL_MS = 15_000;

/** Older than this and the fix is treated as unknown rather than shown as current. */
const MAX_FIX_AGE_MS = 120_000;

/** Movement below this keeps the previous object, so lists don't re-render. */
const MIN_MOVE_METERS = 50;

/**
 * The driver's last known position, for distance display.
 *
 * Reads the OS's cached fix instead of opening a second watcher —
 * `useDriverLocation` already holds one while the driver is online, so this adds
 * no battery cost. Returns null when offline, which is what hides the badges.
 */
export function useDriverPosition(): Coords | null {
  const { online } = useOnlineStatus();
  const [position, setPosition] = useState<Coords | null>(null);

  useEffect(() => {
    if (!online) {
      setPosition(null);
      return;
    }

    let cancelled = false;

    async function read() {
      try {
        const fix = await Location.getLastKnownPositionAsync({ maxAge: MAX_FIX_AGE_MS });
        if (cancelled || !fix?.coords) return;
        const next: Coords = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        setPosition((prev) =>
          prev && haversineKm(prev, next) * 1000 < MIN_MOVE_METERS ? prev : next,
        );
      } catch {
        // Keep whatever we had; a missed read is not worth clearing the badges.
      }
    }

    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [online]);

  return position;
}