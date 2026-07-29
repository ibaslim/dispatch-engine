/**
 * Order types for the driver app.
 *
 * These mirror the API's driver-scoped order payload (`_driver_order_response`
 * in `apps/api/app/api/routers/orders.py`), which deliberately zeroes out
 * platform finances — `subtotal`, `tax_*`, `delivery_fees`, `delivery_tips`,
 * `discount`, `total`, `payment_details` and per-item prices all come back as
 * 0/null for drivers. Those fields are omitted here rather than typed as
 * always-zero, so no screen can accidentally present them as real money. The
 * driver's own earnings live in the `driver_*payout` fields.
 *
 * Note: do NOT use `OrderStatus` from `@dispatch/shared/domain` — that enum
 * predates the current API and lists a different set of values.
 */

/** Which tab/bucket the order sits in. Derived server-side. */
export type OrderStatus = 'current' | 'scheduled' | 'completed' | 'incomplete' | 'history';

/** The driver-driven progress of a job. This is what the app advances. */
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

/**
 * Valid reasons per stage. The API rejects mismatches with a 400
 * (`orders.py` PICKUP_INCIDENT_REASONS / DELIVERY_INCIDENT_REASONS), so the
 * report form should build its options from these.
 */
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

export interface OrderItem {
  itemName: string;
  itemQty: number;
}

export interface DriverInfo {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone_number: string | null;
  contact_phone_country_code: string | null;
}

/**
 * `signature` / `picture` are the *requirements* set when the order was
 * created; `submission` is what the driver has captured so far.
 */
export interface ProofOfDelivery {
  signature?: boolean;
  picture?: boolean;
  submission?: {
    recipient_name?: string;
    signature_path?: string;
    signature_uploaded_at?: string;
    photo_path?: string;
    photo_uploaded_at?: string;
  };
}

export interface IncidentReport {
  id: string;
  stage: IncidentStage;
  reason: IncidentReason;
  description: string | null;
  reported_by: string | null;
  reported_at: string;
}

export interface DriverOrder {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  activity_status: ActivityStatus;
  ready_for_pickup: boolean;

  pickup_name: string;
  pickup_phone: string;
  pickup_address: string;
  pickup_date: string;
  pickup_time: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;

  delivery_name: string;
  delivery_phone: string;
  delivery_address: string;
  delivery_date: string;
  delivery_time: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;

  items: OrderItem[];
  instructions: string | null;

  /** Driver earnings. Locked to a snapshot once the order is accepted. */
  driver_payout: number | null;
  driver_fee_payout: number | null;
  driver_tip_payout: number | null;
  driver_payment_rule: string | null;

  proof_of_delivery: ProofOfDelivery | null;
  incident_report: IncidentReport | null;
  driver: DriverInfo | null;

  /** Broadcast fields — only meaningful for published (unclaimed) orders. */
  published: boolean;
  published_at: string | null;
  created_at: string | null;
}

/** A local file selected from the camera or gallery, for multipart upload. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}