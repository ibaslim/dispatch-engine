import { plannedDate, plannedTime, type DriverOrder } from '@dispatch/shared/contracts';
import { formatDateTime } from './orders-formatting.util';

/** Mirrors the API's PUBLISH_WINDOW_MINUTES; the server enforces it too. */
export const OFFER_WINDOW_SECONDS = 15 * 60;

/** A published order as a driver sees it while deciding whether to accept. */
export interface OfferCard {
  id: string;
  orderNumber: string;
  pickupName: string;
  pickupAddress: string;
  /** "Sep 20, 2:30pm", or "Sep 20, any time" for a date-only stop. */
  pickupWhen: string;
  pickupTimeSpecified: boolean;
  deliveryName: string;
  deliveryAddress: string;
  deliveryWhen: string;
  deliveryTimeSpecified: boolean;
  driverFee: number;
  feePayout: number | null;
  tipPayout: number | null;
  routeDistanceMeters: number | null;
  routeDurationSeconds: number | null;
  items: { name: string; qty: number }[];
  instructions: string;
  publishedAt: Date;
  remainingSeconds: number;
  accepting: boolean;
  accepted: boolean;
}

function stopWhen(plannedAt: string, timeSpecified: boolean): string {
  return formatDateTime(plannedDate(plannedAt), plannedTime(plannedAt, timeSpecified) ?? '');
}

export function toOfferCard(order: DriverOrder, now = Date.now()): OfferCard {
  const publishedAt = order.published_at ? new Date(order.published_at) : new Date(now);
  const elapsed = Math.floor((now - publishedAt.getTime()) / 1000);
  return {
    id: String(order.id),
    orderNumber: String(order.order_number ?? ''),
    pickupName: order.pickup_name ?? '',
    pickupAddress: order.pickup_address ?? '',
    pickupWhen: stopWhen(order.pickup_planned_at, order.pickup_time_specified),
    pickupTimeSpecified: order.pickup_time_specified,
    deliveryName: order.delivery_name ?? '',
    deliveryAddress: order.delivery_address ?? '',
    deliveryWhen: stopWhen(order.delivery_planned_at, order.delivery_time_specified),
    deliveryTimeSpecified: order.delivery_time_specified,
    driverFee: Number(order.driver_payout ?? 0),
    feePayout: order.driver_fee_payout,
    tipPayout: order.driver_tip_payout,
    routeDistanceMeters: order.route_distance_meters,
    routeDurationSeconds: order.route_duration_seconds,
    items: (order.items ?? []).map((item) => ({ name: item.itemName, qty: item.itemQty })),
    instructions: order.instructions ?? '',
    publishedAt,
    remainingSeconds: Math.max(0, OFFER_WINDOW_SECONDS - elapsed),
    accepting: false,
    accepted: false,
  };
}

export function offerCountdownLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${String(m).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function offerCountdownPercent(seconds: number): number {
  return Math.round((seconds / OFFER_WINDOW_SECONDS) * 100);
}

export function offerCountdownBarClass(seconds: number): string {
  const pct = offerCountdownPercent(seconds);
  if (pct > 50) return 'bg-emerald-500';
  if (pct > 20) return 'bg-amber-400';
  return 'bg-red-500';
}

export function offerCountdownTextClass(seconds: number): string {
  if (seconds > 300) return 'text-emerald-500';
  if (seconds > 120) return 'text-amber-400';
  return 'text-red-500';
}

/** "18 min over 12.4 km"; either half alone when the other is unknown. */
export function formatTrip(meters: number | null, seconds: number | null): string | null {
  const parts: string[] = [];
  if (seconds != null) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    const rest = minutes % 60;
    parts.push(minutes < 60 ? `${minutes} min` : rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`);
  }
  if (meters != null) {
    parts.push(meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`);
  }
  return parts.length ? parts.join(' over ') : null;
}
