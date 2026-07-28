/**
 * Order operations available to a driver.
 *
 * This is the driver-reachable subset of the dispatcher's `OrdersService`
 * (`apps/dispatcher-web/src/app/services/orders/orders.service.ts`). Order
 * creation, pricing quotes, driver assignment, publishing and recipient
 * notifications are dispatcher/admin flows — the API rejects them for driver
 * tenants — so they are intentionally absent.
 */
import { fetchWithAuth, patchWithAuth, postWithAuth, uploadWithAuth } from '@services/api';
import type {
  ActivityStatus,
  DriverOrder,
  IncidentReason,
  IncidentReport,
  IncidentStage,
  LocalFile,
  OrderStatus,
} from '@types';

const BASE_URL = '/api/v1/orders';

/**
 * Orders assigned to the signed-in driver. The API scopes the result by the
 * caller's tenant, so there is no driver id to pass.
 */
export function getMyOrders(): Promise<DriverOrder[]> {
  return fetchWithAuth<DriverOrder[]>(BASE_URL);
}

/**
 * Orders broadcast to all drivers and not yet claimed. The server only returns
 * those inside the 15-minute publish window, so this list shrinks on its own —
 * re-fetch on the `new_order` websocket message rather than polling.
 */
export function getPublishedOrders(): Promise<DriverOrder[]> {
  return fetchWithAuth<DriverOrder[]>(`${BASE_URL}/published`);
}

/**
 * Claim a published order. Races are resolved server-side: a 409 means another
 * driver got there first, and a 410 means the broadcast window closed. Both are
 * expected outcomes — surface them as a message, not an error state.
 */
export function acceptOrder(orderId: string): Promise<DriverOrder> {
  return postWithAuth<DriverOrder>(`${BASE_URL}/${orderId}/accept`, {});
}

export interface ActivityStatusResult {
  success: boolean;
  activity_status: ActivityStatus;
  /** Advancing to `delivered` also completes the order server-side. */
  status: OrderStatus;
}

/** Advance the job's progress. Only the assigned driver may call this. */
export function updateActivityStatus(
  orderId: string,
  activityStatus: ActivityStatus,
): Promise<ActivityStatusResult> {
  return patchWithAuth<ActivityStatusResult>(`${BASE_URL}/${orderId}/activity-status`, {
    activity_status: activityStatus,
  });
}

/** Email the recipient with full order details and a tracking link. */
export function sendRecipientNotification(orderId: string): Promise<void> {
  return postWithAuth<void>(`${BASE_URL}/${orderId}/notify/recipient`, {});
}

/**
 * React Native's FormData takes a `{ uri, name, type }` descriptor where the
 * DOM expects a Blob; the cast is required and safe on this platform.
 */
function appendFile(form: FormData, file: LocalFile): void {
  form.append('file', file as unknown as Blob);
}

/** Upload a proof-of-delivery photo. Max 10 MB; jpeg, png or webp. */
export function uploadDeliveryPhoto(orderId: string, photo: LocalFile): Promise<void> {
  const form = new FormData();
  appendFile(form, photo);
  return uploadWithAuth(`${BASE_URL}/${orderId}/proof-of-delivery/photo`, form);
}

/** Upload a captured recipient signature. `recipientName` must be non-empty. */
export function uploadDeliverySignature(
  orderId: string,
  signature: LocalFile,
  recipientName: string,
): Promise<void> {
  const form = new FormData();
  appendFile(form, signature);
  form.append('recipient_name', recipientName);
  return uploadWithAuth(`${BASE_URL}/${orderId}/proof-of-delivery/signature`, form);
}

/**
 * Report a problem at pickup or delivery. An order accepts only one report —
 * a second call returns 400. Validate `reason` against the stage's allowed set
 * and supply a description where required (see `@types/order`) to avoid a 400.
 */
export function reportIncident(
  orderId: string,
  stage: IncidentStage,
  reason: IncidentReason,
  description: string | null = null,
): Promise<{ success: boolean; incident_report: IncidentReport }> {
  return postWithAuth(`${BASE_URL}/${orderId}/report`, { stage, reason, description });
}