/**
 * Route plan wire contract for `GET /api/v1/orders/route-plan`. Mirrors
 * `RoutePlanResponse` in `apps/api/app/schemas/order.py` — change both together.
 */

/** What a stop on the ordered run is for. */
export type RouteStopKind = 'pickup' | 'drop';

export interface RouteStop {
  sequence: number;
  order_id: string;
  order_number: string | null;
  kind: RouteStopKind;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  place_id: string | null;
  /** Driving from the previous stop, or from the driver for the first one. */
  leg_distance_meters: number | null;
  leg_duration_seconds: number | null;
}

/** An outstanding order left out of the run because it has no coordinates. */
export interface UnplaceableStop {
  order_id: string;
  order_number: string | null;
  kind: RouteStopKind;
  address: string | null;
}

export interface RoutePlan {
  origin_latitude: number;
  origin_longitude: number;
  stops: RouteStop[];
  unplaceable: UnplaceableStop[];
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
  /** `local` figures are straight-line estimates with no live traffic. */
  optimized_by: 'routes_api' | 'local';
}
