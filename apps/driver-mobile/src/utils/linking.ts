import { Linking, Platform } from 'react-native';

import type { RouteStop } from '@dispatch/shared/contracts';

/** Dial a number. No-ops when there's no dialer (e.g. a simulator). */
export function callNumber(phone: string): void {
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => undefined);
}

/**
 * Open turn-by-turn directions in the platform's maps app. Coordinates are used
 * when the order carries them (geocoded at creation) since they're unambiguous;
 * the text address is the fallback.
 */
export function openDirections(
  address: string,
  latitude?: number | null,
  longitude?: number | null,
): void {
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';
  const destination = hasCoords ? `${latitude},${longitude}` : address;
  const encoded = encodeURIComponent(destination);

  const url = Platform.select({
    ios: `maps://?daddr=${encoded}`,
    default: `geo:0,0?q=${encoded}`,
  });

  Linking.openURL(url).catch(() => undefined);
}

/**
 * Google's Maps URL caps a route at nine waypoints, so one launch covers this
 * many stops — the ninth waypoint plus the destination.
 */
export const MAX_STOPS_PER_LAUNCH = 10;

function coordOf(stop: RouteStop): string {
  return `${stop.latitude},${stop.longitude}`;
}

/** Whether a multi-stop route can be handed off at all on this device. */
export async function canOpenRoute(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  // Apple Maps has no multi-stop URL scheme, so iOS needs Google Maps installed.
  return Linking.canOpenURL('comgooglemaps://').catch(() => false);
}

/**
 * Hand an ordered run to the Google Maps app.
 *
 * Maps honours waypoints in the order given, which is the whole point: the
 * sequence is decided server-side and Maps only drives it. Stops past the
 * tenth are dropped — by the time the driver works through those, the earlier
 * orders have advanced and the plan is re-optimized anyway.
 *
 * No origin is sent: Maps starts from the live position, which is newer than
 * the fix the plan was built on.
 */
export function buildRouteUrl(stops: RouteStop[]): string | null {
  if (stops.length === 0) return null;

  const leg = stops.slice(0, MAX_STOPS_PER_LAUNCH);
  const destination = leg[leg.length - 1];
  const waypoints = leg.slice(0, -1);

  const params = [
    'api=1',
    `destination=${encodeURIComponent(coordOf(destination))}`,
    'travelmode=driving',
    'dir_action=navigate',
  ];

  if (waypoints.length > 0) {
    params.push(`waypoints=${encodeURIComponent(waypoints.map(coordOf).join('|'))}`);
    // Place ids pin the real entrance, but Maps only accepts them alongside a
    // matching waypoint for every stop — all or nothing.
    if (waypoints.every((stop) => stop.place_id)) {
      params.push(
        `waypoint_place_ids=${encodeURIComponent(
          waypoints.map((stop) => stop.place_id).join('|'),
        )}`,
      );
    }
  }

  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}

export async function openRoute(stops: RouteStop[]): Promise<boolean> {
  const url = buildRouteUrl(stops);
  if (!url) return false;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
