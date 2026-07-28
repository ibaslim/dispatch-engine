import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'driver.pref.muteBroadcasts';

/**
 * Persisted "mute broadcasts" preference. When on, dispatcher broadcast
 * announcements shouldn't raise notifications. The value is read once on mount
 * and written back whenever it changes.
 */
export function useMuteBroadcasts(): {
  muted: boolean;
  setMuted: (next: boolean) => void;
  /**
   * Re-read the stored value. Tab screens stay mounted, so a consumer showing
   * the flag (e.g. Home's mute indicator) calls this on focus to pick up a
   * toggle made on another screen.
   */
  reload: () => void;
} {
  const [muted, setMutedState] = useState(false);

  const reload = useCallback(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value != null) setMutedState(value === 'true');
      })
      .catch(() => {
        // Ignore read errors; default to unmuted.
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {
      // Best-effort persistence.
    });
  }, []);

  return { muted, setMuted, reload };
}
