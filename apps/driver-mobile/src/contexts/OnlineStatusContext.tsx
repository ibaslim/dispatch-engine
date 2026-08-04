import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import type { BackgroundPermissionState } from '@services/driver';

const STORAGE_KEY = 'driver.pref.online';

/**
 * Whether screen-off tracking is actually working. `useDriverLocation` reports
 * this after it resolves background permission.
 *
 * This is surfaced because foreground permission alone is not enough to keep a
 * driver trackable: on Android 11+ background location cannot be granted by a
 * dialog at all, so a driver could previously go "Online", lock their phone,
 * and silently stop reporting with nothing in the UI to say so.
 */
export type BackgroundTrackingState = BackgroundPermissionState | 'unknown';

/**
 * Why the driver is currently offline. Drives the Home status card copy:
 * a manual "Go Offline" reads calm, a permission loss reads as a requirement.
 */
export type OfflineReason = 'manual' | 'permission' | 'services_disabled';

interface OnlineStatusContextValue {
  /** True while the driver is live and receiving new orders. */
  online: boolean;
  /** Meaningful only while offline. */
  offlineReason: OfflineReason;
  /** True until the persisted state + permission check have settled. */
  isRestoring: boolean;
  /**
   * Whether background (screen-off) tracking is running. `'needs-settings'`
   * means the driver must grant "Allow all the time" in system settings.
   */
  backgroundTracking: BackgroundTrackingState;
  /** Reported by the location tracker; not intended for screen components. */
  reportBackgroundTracking: (state: BackgroundTrackingState) => void;
  /**
   * Request location permission and go online. Resolves to true on success;
   * false means permission was denied (the caller may point the driver at
   * system settings).
   */
  goOnline: () => Promise<boolean>;
  goOffline: () => void;
}

const OnlineStatusContext = createContext<OnlineStatusContextValue | null>(null);

/**
 * Client-held online/offline shift state, gated by location permission and device location services.
 *
 * The API has no driver-availability endpoint (`drivers.py` only reports
 * `is_online` to admins), so this is the app's source of truth: going online
 * requires foreground location permission and device location services enabled,
 * and losing either while online forces the driver offline (the design treats
 * location as a requirement of being online, not an optional extra).
 *
 * The flag persists across launches so a driver who was on shift stays online
 * after an app restart — but only after re-verifying permission on boot and on
 * every return to the foreground.
 */
export function OnlineStatusProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(false);
  const [offlineReason, setOfflineReason] = useState<OfflineReason>('manual');
  const [isRestoring, setIsRestoring] = useState(true);
  const [backgroundTracking, setBackgroundTracking] = useState<BackgroundTrackingState>('unknown');
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const reportBackgroundTracking = useCallback((state: BackgroundTrackingState) => {
    setBackgroundTracking(state);
  }, []);

  const forceOffline = useCallback((reason: OfflineReason) => {
    setOnline(false);
    setOfflineReason(reason);
    AsyncStorage.setItem(STORAGE_KEY, 'false').catch(() => {
      // Best-effort persistence.
    });
  }, []);

  // Restore the persisted shift state, re-verifying permission and location services first.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored !== 'true') return;
        
        const { granted } = await Location.getForegroundPermissionsAsync();
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        
        if (!active) return;
        if (granted && servicesEnabled) {
          setOnline(true);
        } else if (!granted) {
          forceOffline('permission');
        } else {
          forceOffline('services_disabled');
        }
      } catch {
        // Treat storage/permission errors as a fresh offline start.
      } finally {
        if (active) setIsRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [forceOffline]);

  // Permission and hardware status can change when the app is in the background.
  // Re-checking on every return to foreground catches these updates.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !onlineRef.current) return;
      Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.hasServicesEnabledAsync(),
      ])
        .then(([{ granted }, servicesEnabled]) => {
          if (!onlineRef.current) return;
          if (!granted) {
            forceOffline('permission');
          } else if (!servicesEnabled) {
            forceOffline('services_disabled');
          }
        })
        .catch(() => {
          // Keep the current state if the check itself fails.
        });
    });
    return () => sub.remove();
  }, [forceOffline]);

  // The AppState listener above misses changes made without backgrounding the
  // app — toggling GPS from the Android quick-settings shade leaves the app
  // 'active'. This poll covers that gap. It is not free (each tick queries
  // permission state and the location provider), so keep the interval coarse.
  useEffect(() => {
    if (!online) return;

    const interval = setInterval(async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (onlineRef.current) {
          if (!granted) {
            forceOffline('permission');
          } else if (!servicesEnabled) {
            forceOffline('services_disabled');
          }
        }
      } catch {
        // Ignore check failures
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [online, forceOffline]);

  const goOnline = useCallback(async (): Promise<boolean> => {
    // 1. Check if permission is already granted first, avoiding duplicate prompts
    let { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) {
      const requestResult = await Location.requestForegroundPermissionsAsync();
      granted = requestResult.granted;
    }

    if (!granted) {
      forceOffline('permission');
      return false;
    }
    
    // 2. Check device location services status
    let servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      // Proactively trigger native system location prompt directly in the app (Android only)
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
          servicesEnabled = await Location.hasServicesEnabledAsync();
        } catch {
          // User canceled or failed to enable services
        }
      }
    }

    if (!servicesEnabled) {
      forceOffline('services_disabled');
      return false;
    }

    setOnline(true);
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {
      // Best-effort persistence.
    });
    return true;
  }, [forceOffline]);

  const goOffline = useCallback(() => forceOffline('manual'), [forceOffline]);

  const value = useMemo<OnlineStatusContextValue>(
    () => ({
      online,
      offlineReason,
      isRestoring,
      backgroundTracking,
      reportBackgroundTracking,
      goOnline,
      goOffline,
    }),
    [
      online,
      offlineReason,
      isRestoring,
      backgroundTracking,
      reportBackgroundTracking,
      goOnline,
      goOffline,
    ],
  );

  return <OnlineStatusContext.Provider value={value}>{children}</OnlineStatusContext.Provider>;
}

export function useOnlineStatus(): OnlineStatusContextValue {
  const context = useContext(OnlineStatusContext);
  if (!context) throw new Error('useOnlineStatus must be used within an OnlineStatusProvider');
  return context;
}
