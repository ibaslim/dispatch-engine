/**
 * Owns driver location tracking for the authenticated session.
 *
 * Two non-overlapping paths: the foreground watcher + heartbeat run only while
 * `AppState` is `active` (the heartbeat covers parked drivers, since a watcher
 * emits nothing when stationary); the background service covers everything else.
 *
 * The background service is never stopped on returning to the foreground —
 * Android 12+ forbids starting one from the background, so it could never
 * restart. The task defers via the heartbeat lease instead.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import { useOnlineStatus } from '@contexts';
import {
  LOCATION_TASK_NAME,
  ensureBackgroundPermission,
  ensureNotificationPermission,
  isBackgroundTrackingActive,
  promptBatteryExemptionOnce,
  pushDriverLocation,
  releaseForegroundHeartbeat,
  renewForegroundHeartbeat,
  setMinPushInterval,
  stopBackgroundTracking,
} from '@services/driver';

/** Configured via EXPO_PUBLIC_DRIVER_LOCATION_PUSH_INTERVAL_SECONDS env var (defaults to 5 seconds). */
const PUSH_INTERVAL_SECONDS =
  Number(process.env.EXPO_PUBLIC_DRIVER_LOCATION_PUSH_INTERVAL_SECONDS) || 5;
const PUSH_INTERVAL_MS = PUSH_INTERVAL_SECONDS * 1000;

/**
 * iOS ignores `timeInterval` (Android-only) and drives updates purely from
 * `distanceInterval`, where `0` means every GPS fix (~1/sec). A metre threshold
 * keeps updates movement-proportional; the heartbeat covers standing still.
 */
const IOS_DISTANCE_INTERVAL_METERS = 20;

/** A cached fix older than this is refreshed rather than re-sent. */
const FIX_FRESHNESS_MS = PUSH_INTERVAL_MS * 2;

function log(message: string): void {
  if (__DEV__) console.log(message);
}

/** Watch options differ per platform because the throttling knobs differ. */
function watchOptions(): Location.LocationOptions {
  if (Platform.OS === 'ios') {
    return {
      accuracy: Location.Accuracy.High,
      distanceInterval: IOS_DISTANCE_INTERVAL_METERS,
    };
  }
  return {
    accuracy: Location.Accuracy.High,
    timeInterval: PUSH_INTERVAL_MS,
    distanceInterval: 0,
  };
}

/**
 * Background task options.
 *
 * Android survives termination via `killServiceOnDestroy: false`. Not
 * `stopOnTerminate` — that was removed from `LocationTaskOptions` in SDK 55, so
 * setting it did nothing while looking configured.
 *
 * iOS gets a coarser version for free: expo also registers
 * `startMonitoringSignificantLocationChanges`, so a killed app still reports at
 * ~500m granularity. Continuous updates don't survive a force-quit.
 *
 * `deferredUpdates*` applies to both platforms (expo implements it in JS on
 * iOS) and only shapes background reporting.
 */
function taskOptions(): Location.LocationTaskOptions {
  const shared: Location.LocationTaskOptions = {
    accuracy: Location.Accuracy.High,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
  };

  if (Platform.OS === 'ios') {
    // `timeInterval`/`foregroundService` are Android-only. `deferredUpdates*`
    // is honoured, and defaults to 0 (report every background fix).
    return {
      ...shared,
      distanceInterval: IOS_DISTANCE_INTERVAL_METERS,
      deferredUpdatesInterval: PUSH_INTERVAL_MS,
      deferredUpdatesDistance: 0,
    };
  }

  return {
    ...shared,
    timeInterval: PUSH_INTERVAL_MS,
    distanceInterval: 0,
    deferredUpdatesInterval: PUSH_INTERVAL_MS,
    deferredUpdatesDistance: 0,
    foregroundService: {
      notificationTitle: 'Driver Online - Dispatch Tracking',
      notificationBody: 'Sharing location for active dispatch tracking',
      notificationColor: '#1d4ed8',
      // Survive a swipe-away; the shift is still running. Going offline ends it.
      killServiceOnDestroy: false,
    },
  };
}

export function useDriverLocation(): void {
  const { online, reportBackgroundTracking } = useOnlineStatus();
  /** Whether this session actually started tracking, so we only stop what we started. */
  const startedRef = useRef(false);

  useEffect(() => {
    if (!online) {
      // Only path that ends a shift. Guarded so an offline mount sends no DELETE.
      if (startedRef.current) {
        startedRef.current = false;
        releaseForegroundHeartbeat();
        reportBackgroundTracking('unknown');
        void stopBackgroundTracking();
      }
      return;
    }

    startedRef.current = true;
    setMinPushInterval(PUSH_INTERVAL_MS);

    // Per-run state, so a stale run can never touch the live run's watcher.
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let latest: Location.LocationObject | null = null;
    let refreshing = false;

    function stopForeground() {
      // Release before teardown so no window has neither side reporting.
      releaseForegroundHeartbeat();
      watcher?.remove();
      watcher = null;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    }

    async function send(fix: Location.LocationObject, force = false) {
      // Renew every beat; if this stops for any reason the lease lapses and
      // the background task resumes.
      renewForegroundHeartbeat();
      try {
        const sent = await pushDriverLocation(fix.coords.latitude, fix.coords.longitude, {
          timestamp: fix.timestamp,
          force,
        });
        if (sent) {
          log(
            `[LOCATION] Sent lat=${fix.coords.latitude}, lng=${fix.coords.longitude} (interval: ${PUSH_INTERVAL_SECONDS}s)`,
          );
        }
      } catch (err) {
        log(`[LOCATION] Push failed: ${String(err)}`);
      }
    }

    /**
     * Heartbeat tick. A stale cache triggers a fresh fix rather than re-sending
     * it, which would misreport lost GPS as stationary. Also the only thing
     * keeping a parked driver on the map.
     */
    async function tick() {
      if (cancelled || refreshing) return;

      if (latest && Date.now() - latest.timestamp < FIX_FRESHNESS_MS) {
        await send(latest);
        return;
      }

      refreshing = true;
      try {
        const fresh = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled || !fresh?.coords) return;
        latest = fresh;
        await send(fresh);
      } catch {
        // No fix available — stay quiet rather than assert a stale position.
      } finally {
        refreshing = false;
      }
    }

    async function startForeground() {
      stopForeground();
      const subscription = await Location.watchPositionAsync(watchOptions(), (loc) => {
        if (cancelled || !loc?.coords) return;
        latest = loc;
        void send(loc);
      });

      // The await can outlive the effect; drop the subscription if so.
      if (cancelled) {
        subscription.remove();
        return;
      }
      watcher = subscription;
      heartbeat = setInterval(() => void tick(), PUSH_INTERVAL_MS);
      renewForegroundHeartbeat();
    }

    function handleAppStateChange(next: AppStateStatus) {
      if (cancelled) return;
      if (next === 'active') {
        if (!watcher) void startForeground();
      } else {
        // Background is the service's job; a watcher here only burns battery.
        stopForeground();
      }
    }

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    async function start() {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (fgStatus !== 'granted') {
        console.warn('[LOCATION] Foreground location permission denied.');
        return;
      }

      // Seed from OS cache so the driver appears on the map before the first fix.
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (cancelled) return;
      if (lastKnown?.coords) {
        latest = lastKnown;
        await send(lastKnown, true);
        if (cancelled) return;
      }

      await startForeground();
      if (cancelled) return;

      // Prompts only where one can succeed; Android 11+ returns 'needs-settings'.
      const backgroundState = await ensureBackgroundPermission();
      if (cancelled) return;
      reportBackgroundTracking(backgroundState);

      if (backgroundState !== 'granted') {
        log(`[LOCATION] Background tracking unavailable (${backgroundState}).`);
        return;
      }

      // Before starting the service, so the first shift shows the indicator.
      await ensureNotificationPermission();
      if (cancelled) return;

      try {
        // Normal after a mid-shift restart: the service outlived the process.
        const alreadyRunning = await isBackgroundTrackingActive();
        if (cancelled) return;
        if (!alreadyRunning) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions());
        }
        log('[LOCATION] Background location service running.');

        // Only once tracking is actually running. Doze/OEM battery managers are
        // the usual reason it dies partway through a shift.
        if (!cancelled) void promptBatteryExemptionOnce();
      } catch (err) {
        reportBackgroundTracking('denied');
        console.warn('[LOCATION] Could not start background location service:', err);
      }
    }

    void start();

    // Releases only this JS context's resources. The service and server-side
    // position must survive, since this also runs when the app is swiped away
    // mid-shift; `stopBackgroundTracking` in the offline branch ends a shift.
    // The handoff doesn't depend on this running at all — the lease expires.
    return () => {
      cancelled = true;
      appStateSub.remove();
      stopForeground();
    };
  }, [online, reportBackgroundTracking]);
}