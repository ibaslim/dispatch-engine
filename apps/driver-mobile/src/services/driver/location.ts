/**
 * Driver location API calls.
 *
 * Kept in a dedicated module so the heartbeat hook and any future
 * location-aware feature import from one place — no raw fetch() calls
 * scattered across components.
 */
import { deleteWithAuth, postWithAuth } from '@services/api';

const BASE = '/api/v1/drivers';

/**
 * Push the driver's current GPS coordinates to the backend.
 * The server persists them in Redis with a 15-minute TTL.
 *
 * Called every 5 minutes by `useDriverLocation` while the driver is online.
 */
export function pushDriverLocation(lat: number, lng: number): Promise<void> {
  return postWithAuth<void>(`${BASE}/me/location`, { lat, lng });
}

/**
 * Remove the driver's coordinates from Redis immediately on going offline.
 * Prevents dispatchers from seeing a stale position after the driver logs off.
 */
export function clearDriverLocation(): Promise<void> {
  return deleteWithAuth<void>(`${BASE}/me/location`);
}
