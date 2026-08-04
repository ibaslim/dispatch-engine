/**
 * Driver location API calls, and the single rate limiter for location traffic.
 *
 * Three producers push concurrently (foreground watcher, foreground heartbeat,
 * background task), so the throttle lives here rather than in any one caller.
 * It is per JS context, which is correct: a headless relaunch has no competing
 * producers and should start with a fresh window.
 */
import { deleteWithAuth, postWithAuth } from '@services/api';

const BASE = '/api/v1/drivers';

/** Give up on a push well before the OS kills a background task slot. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Older fixes are dropped. Re-posting a cached coordinate after GPS loss would
 * look identical to "parked" on the server.
 */
const MAX_FIX_AGE_MS = 60_000;

export interface PushOptions {
  /** Minimum gap between accepted pushes. Defaults to `setMinPushInterval`. */
  minIntervalMs?: number;
  /** Bypass the throttle (first fix after going online). */
  force?: boolean;
  /** `Location.LocationObject.timestamp` of the fix, for staleness rejection. */
  timestamp?: number;
}

let minPushIntervalMs = 5_000;
let lastPushAt = 0;
let inFlight = false;
let lastForegroundBeatAt = 0;

/** How long the foreground tracker's heartbeat claim stays valid. */
const FOREGROUND_CLAIM_TTL_MS = 12_000;

/**
 * Renew the in-app tracker's claim on the heartbeat. Must be a lease, not a
 * boolean: swiping from recents destroys the Activity but keeps the process, so
 * the flag may never be cleared while Android freezes the timers that would
 * clear it — the background task would then stand down forever. A lease expires
 * on its own, so the task always recovers.
 */
export function renewForegroundHeartbeat(): void {
  lastForegroundBeatAt = Date.now();
}

export function releaseForegroundHeartbeat(): void {
  lastForegroundBeatAt = 0;
}

/** True while the in-app tracker holds an unexpired claim on the heartbeat. */
export function foregroundHeartbeatActive(): boolean {
  return lastForegroundBeatAt > 0 && Date.now() - lastForegroundBeatAt < FOREGROUND_CLAIM_TTL_MS;
}

/** Align the throttle with the tracker's configured heartbeat interval. */
export function setMinPushInterval(ms: number): void {
  minPushIntervalMs = Math.max(0, ms);
}

/** Reset throttle state so the next fix is sent immediately. */
export function resetPushThrottle(): void {
  lastPushAt = 0;
}

/**
 * Push the driver's current GPS coordinates to the backend.
 * The server persists them in Redis with a 15-minute TTL.
 *
 * Resolves `true` if sent, `false` if throttled/stale/superseded. Rejects only
 * on a real transport failure, so callers can tell "skipped" from "failed".
 */
export async function pushDriverLocation(
  lat: number,
  lng: number,
  options: PushOptions = {},
): Promise<boolean> {
  const { minIntervalMs = minPushIntervalMs, force = false, timestamp } = options;
  const now = Date.now();

  if (timestamp !== undefined && now - timestamp > MAX_FIX_AGE_MS) {
    return false;
  }

  // Stops pushes piling up behind a stalled request on a slow network.
  if (inFlight) {
    return false;
  }

  if (!force && now - lastPushAt < minIntervalMs) {
    return false;
  }

  // Claim the window before awaiting, so two producers can't both pass above.
  const previousPushAt = lastPushAt;
  lastPushAt = now;
  inFlight = true;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    await postWithAuth<void>(`${BASE}/me/location`, { lat, lng }, controller.signal);
    return true;
  } catch (err) {
    // Release the window so the next fix retries immediately.
    lastPushAt = previousPushAt;
    throw err;
  } finally {
    clearTimeout(timeoutId);
    inFlight = false;
  }
}

/**
 * Remove the driver's coordinates from Redis immediately on going offline.
 * Prevents dispatchers from seeing a stale position after the driver logs off.
 */
export async function clearDriverLocation(): Promise<void> {
  resetPushThrottle();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    await deleteWithAuth<void>(`${BASE}/me/location`, controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}