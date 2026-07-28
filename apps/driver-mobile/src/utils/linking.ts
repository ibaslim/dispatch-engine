import { Linking, Platform } from 'react-native';

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