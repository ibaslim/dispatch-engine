/**
 * Order wire contract for `/api/v1/orders`. Mirrors `OrderResponse` in
 * `apps/api/app/schemas/order.py` — change both together.
 *
 * Do NOT use `OrderStatus` from `@dispatch/shared/domain`; that enum predates
 * the current API and lists a different set of values.
 */

/** Which bucket the order sits in. Derived server-side. */
export type OrderStatus = 'current' | 'scheduled' | 'completed' | 'incomplete' | 'history';

/** The driver-driven progress of a job. */
export type ActivityStatus =
  | 'driver_not_assigned'
  | 'pickup_initiated'
  | 'picked_up'
  | 'delivery_initiated'
  | 'delivery_in_progress'
  | 'delivered';

export type IncidentStage = 'pickup' | 'delivery';

export type IncidentReason =
  | 'no_answer'
  | 'wrong_address'
  | 'business_closed'
  | 'parcel_issue'
  | 'refused'
  | 'other';

/** Valid reasons per stage; the API rejects mismatches with a 400. */
export const PICKUP_INCIDENT_REASONS: readonly IncidentReason[] = [
  'no_answer',
  'wrong_address',
  'business_closed',
  'parcel_issue',
  'other',
];

export const DELIVERY_INCIDENT_REASONS: readonly IncidentReason[] = [
  'no_answer',
  'wrong_address',
  'refused',
  'other',
];

/** Reasons the API requires a non-empty description for, at either stage. */
export const INCIDENT_REASONS_REQUIRING_DESCRIPTION: readonly IncidentReason[] = [
  'other',
  'parcel_issue',
];

export type PaymentMethod = 'cash_on_delivery' | 'credit_card';

export interface OrderItem {
  itemName: string;
  itemPrice: number;
  itemQty: number;
}

export interface AppliedCharge {
  id: string | null;
  kind: 'after_hours' | 'surcharge' | 'special_occasion';
  label: string;
  amount: number;
}

export type ManualDiscountKind = 'percentage' | 'fixed_amount';

export type ManualDiscountReason =
  | 'late_delivery'
  | 'damaged_item'
  | 'wrong_address_our_fault'
  | 'sales_goodwill'
  | 'price_correction'
  | 'other';

/** A discount a dispatcher applies by hand. The server prices and caps it. */
export interface ManualDiscount {
  kind: ManualDiscountKind;
  value: number;
  reason: ManualDiscountReason;
  note?: string | null;
}

/** One priced discount line. Discounts only ever come off the delivery fee. */
export interface AppliedDiscount {
  source: 'manual' | 'automatic' | 'code';
  kind: string;
  label: string;
  value: number;
  amount: number;
  reason: string | null;
  note: string | null;
  applied_by: string | null;
}

export interface DriverInfo {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone_number: string | null;
  contact_phone_country_code: string | null;
}

export interface ProofOfDelivery {
  signature?: boolean;
  picture?: boolean;
  submission?: {
    recipient_name?: string;
    signature_path?: string;
    signature_uploaded_at?: string;
    photo_path?: string;
    photo_uploaded_at?: string;
    note?: string | null;
  };
}

export interface PickupVerification {
  method: 'qr' | 'photo';
  verified_at: string;
  verified_by: string | null;
  photo_path?: string | null;
  note?: string | null;
}

export interface IncidentReport {
  id: string;
  stage: IncidentStage;
  reason: IncidentReason;
  description: string | null;
  reported_by: string | null;
  reported_at: string;
}

/** Full order as admins and dispatchers receive it. */
export interface OrderResponse {
  id: string;
  order_number: string;
  driver_id: string | null;
  vendor_id: string | null;
  status: OrderStatus;
  activity_status: ActivityStatus;
  ready_for_pickup: boolean;

  pickup_name: string;
  pickup_phone: string;
  pickup_email: string;
  pickup_address: string;
  /** Wall-clock time, no zone ("2026-09-20T13:40:00"); read it with order-schedule helpers. */
  pickup_planned_at: string;
  /** False means date-only; the time part is 00:00. */
  pickup_time_specified: boolean;
  pickup_place_id: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  pickup_city_id: string | null;
  pickup_zone_id: string | null;

  delivery_name: string;
  delivery_phone: string;
  delivery_email: string;
  delivery_address: string;
  delivery_planned_at: string;
  delivery_time_specified: boolean;
  delivery_place_id: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_city_id: string | null;
  delivery_zone_id: string | null;

  delivery_category_id: string | null;
  /** Quoted pickup-to-drop leg, stamped at creation. Null without a quote. */
  route_distance_meters: number | null;
  route_duration_seconds: number | null;
  surcharge_ids: string[];
  applied_charges: AppliedCharge[];

  items: OrderItem[];
  subtotal: number;
  gst_rate: number;
  gst_amount: number;
  pst_rate: number;
  pst_amount: number;
  delivery_fees: number;
  delivery_tips: number;
  /** Server-priced: the sum of `applied_discounts`, never sent by a client. */
  discount: number;
  applied_discounts: AppliedDiscount[];
  coupon_code: string | null;
  total: number;

  instructions: string | null;
  order_placed_time: string | null;
  payment_method: PaymentMethod;
  payment_details: Record<string, unknown> | null;

  proof_of_delivery: ProofOfDelivery | null;
  pickup_verification: PickupVerification | null;
  incident_report: IncidentReport | null;
  driver: DriverInfo | null;

  /** Driver earnings. Locked to a snapshot once the order is accepted. */
  driver_payout: number | null;
  driver_fee_payout: number | null;
  driver_tip_payout: number | null;
  driver_payment_rule: string | null;
  driver_payment_group_id: string | null;
  driver_payment_group_name: string | null;
  driver_payout_locked_at: string | null;

  published: boolean;
  published_at: string | null;
  created_at: string | null;
}

/** Item as drivers see it; the API zeroes prices, so they're omitted here. */
export type DriverOrderItem = Omit<OrderItem, 'itemPrice'>;

/**
 * Driver-scoped order (`_driver_order_response` in `orders.py`). Platform
 * finances come back zeroed for drivers, so they're omitted rather than typed
 * as always-zero — no screen can present them as real money.
 */
export interface DriverOrder
  extends Pick<
    OrderResponse,
    | 'id'
    | 'status'
    | 'activity_status'
    | 'ready_for_pickup'
    | 'pickup_name'
    | 'pickup_phone'
    | 'pickup_address'
    | 'pickup_planned_at'
    | 'pickup_time_specified'
    | 'pickup_latitude'
    | 'pickup_longitude'
    | 'delivery_name'
    | 'delivery_phone'
    | 'delivery_address'
    | 'delivery_planned_at'
    | 'delivery_time_specified'
    | 'delivery_latitude'
    | 'delivery_longitude'
    | 'route_distance_meters'
    | 'route_duration_seconds'
    | 'instructions'
    | 'driver_payout'
    | 'driver_fee_payout'
    | 'driver_tip_payout'
    | 'driver_payment_rule'
    | 'proof_of_delivery'
    | 'pickup_verification'
    | 'incident_report'
    | 'driver'
    | 'published'
    | 'published_at'
    | 'created_at'
  > {
  order_number: string | null;
  items: DriverOrderItem[];
}
