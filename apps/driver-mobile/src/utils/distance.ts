/**
 * Straight-line distance between coordinates, padded to a realistic road figure.
 *
 * Deliberately not a routing call: the driver's position and both stops are
 * already on the device, so this costs nothing and works with no signal. The
 * trade is accuracy — see `ROAD_FACTOR`.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Padding applied to the crow-flies distance.
 *
 * Road networks run 20–40% longer than the straight line in a city (the
 * "circuity factor"), so 1.3 sits mid-range. Erring high is the safe direction:
 * a driver told a job is closer than it is under-plans the run, whereas an
 * over-estimate only ever arrives early.
 */
export const ROAD_FACTOR = 1.3;

export interface Coords {
  lat: number;
  lng: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(from: Coords, to: Coords): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Haversine with `ROAD_FACTOR` applied — what the driver actually drives. */
export function roadDistanceKm(from: Coords, to: Coords): number {
  return haversineKm(from, to) * ROAD_FACTOR;
}

/** Coordinates only when both halves are present, so callers can skip the pair. */
export function coordsOf(lat: number | null, lng: number | null): Coords | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

/**
 * Distance for a badge. Rounded coarsely on purpose — the underlying number is
 * an estimate, and metre precision would claim accuracy it doesn't have.
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}