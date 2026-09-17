import { OrderActivityStatus } from '@models/orders/order-entity.model';
import {
  DELIVERY_INCIDENT_REASONS,
  IncidentReason,
  PICKUP_INCIDENT_REASONS,
} from '@dispatch/shared/contracts';

// ─── Activity status flow, shared by anything that drives an order forward ──
// (the Orders table's per-row action, and the driver's order-detail page).
// Action type controls what happens on click: 'direct' updates the status immediately,
// other types route through a checkpoint flow (QR scan, proof of delivery) first.

export type ActivityActionType = 'direct' | 'qr-scan' | 'proof-of-delivery';

export interface ActivityFlowEntry {
  label: string;
  next: OrderActivityStatus | null;
  actionLabel: string | null;
  actionType: ActivityActionType;
}

export const ACTIVITY_STATUS_FLOW: Record<OrderActivityStatus, ActivityFlowEntry> = {
  driver_not_assigned: { label: 'Driver Not Assigned', next: null, actionLabel: null, actionType: 'direct' },
  pickup_initiated: { label: 'Pickup Initiated', next: 'picked_up', actionLabel: 'Mark Picked Up', actionType: 'qr-scan' },
  picked_up: { label: 'Picked Up', next: 'delivery_initiated', actionLabel: 'Start Delivery', actionType: 'direct' },
  delivery_initiated: { label: 'Delivery Initiated', next: 'delivery_in_progress', actionLabel: 'In Transit', actionType: 'direct' },
  delivery_in_progress: { label: 'Delivery In Progress', next: 'delivered', actionLabel: 'Mark Delivered', actionType: 'proof-of-delivery' },
  delivered: { label: 'Delivered', next: null, actionLabel: null, actionType: 'direct' },
};

/** The order a driver moves through a job: used to render progress steppers. */
export const ACTIVITY_STATUS_SEQUENCE: OrderActivityStatus[] = [
  'pickup_initiated',
  'picked_up',
  'delivery_initiated',
  'delivery_in_progress',
  'delivered',
];

// Which checkpoint an incident report belongs to, based on the order's current activity status.
export const INCIDENT_STAGE_BY_ACTIVITY_STATUS: Partial<Record<OrderActivityStatus, 'pickup' | 'delivery'>> = {
  pickup_initiated: 'pickup',
  picked_up: 'delivery',
  delivery_initiated: 'delivery',
  delivery_in_progress: 'delivery',
};

// Display copy for each reason. The valid reasons themselves — and which stage
// allows which — come from the shared contract (`@dispatch/shared/contracts`),
// the same source the API validates against and driver-mobile reads from, so
// the three can't drift out of sync with each other.
const INCIDENT_REASON_LABELS: Record<IncidentReason, string> = {
  no_answer: 'No answer',
  wrong_address: 'Wrong address',
  business_closed: 'Business closed',
  parcel_issue: 'Parcel issue',
  refused: 'Refused',
  other: 'Other',
};

export const INCIDENT_REASONS_BY_STAGE: Record<'pickup' | 'delivery', { value: IncidentReason; label: string }[]> = {
  pickup: PICKUP_INCIDENT_REASONS.map((value) => ({ value, label: INCIDENT_REASON_LABELS[value] })),
  delivery: DELIVERY_INCIDENT_REASONS.map((value) => ({ value, label: INCIDENT_REASON_LABELS[value] })),
};

export function incidentReasonLabel(reason: string): string {
  return INCIDENT_REASON_LABELS[reason as IncidentReason] ?? reason;
}
