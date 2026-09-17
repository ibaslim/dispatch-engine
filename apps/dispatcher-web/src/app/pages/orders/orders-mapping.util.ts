import {
  NewOrderFormValue,
  PaymentMethodType,
  PickupVerification,
  ProofOfDeliverySubmission,
} from '@models/new-order-form/new-order-form.model';
import { OrderEntity } from '@models/orders/order-entity.model';
import { OrderView } from '@models/orders/order-tabs.model';
import { plannedDate, plannedTime, toPlannedAt, type OrderItem, type OrderResponse } from '@dispatch/shared/contracts';
import { driverEarningsLabel, formatDateTime, formatStatusLabel, formatTime, money } from './orders-formatting.util';

// ─── Pure backend<->frontend order mapping helpers extracted from OrdersComponent ──

// Backend order shape comes from the shared contract; aliases keep existing imports working.
export type BackendOrderItem = OrderItem;
export type BackendOrder = OrderResponse;

export type AssignableDriver = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
};

export const PUBLISH_WINDOW_MS = 15 * 60 * 1000;

export function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function splitPhoneNumber(phone: string): { countryCode: string; number: string } {
  const trimmed = String(phone || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length > 10) {
    return {
      countryCode: `+${digits.slice(0, digits.length - 10)}`,
      number: digits.slice(-10)
    };
  }
  return { countryCode: '+1', number: digits };
}

function mapSelectedPlace(
  placeId: string | null | undefined,
  formattedAddress: string,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): NewOrderFormValue['pickup']['location'] {
  if (!placeId) return null;
  return {
    placeId,
    formattedAddress,
    latitude: latitude || 0,
    longitude: longitude || 0,
  };
}

export function formatTenantPhone(countryCode: string | null | undefined, number: string | null | undefined): string {
  const code = String(countryCode ?? '').trim();
  const phoneNumber = String(number ?? '').trim();
  if (!code && !phoneNumber) return '';
  if (!code) return phoneNumber;
  if (!phoneNumber) return code;
  return `${code} ${phoneNumber}`;
}

export function mapPaymentDetails(
  method: PaymentMethodType,
  paymentDetails?: Record<string, unknown> | null
): NewOrderFormValue['details']['payment'] {
  if (method !== 'credit_card') return { method };

  const details = paymentDetails ?? {};
  const src = (
    typeof details['creditCard'] === 'object' && details['creditCard'] !== null
      ? details['creditCard'] as Record<string, unknown>
      : details
  );

  return {
    method,
    creditCard: {
      cardholderName: String(src['cardholderName'] ?? ''),
      cardNumber: String(src['cardNumber'] ?? ''),
      expiryMonth: String(src['expiryMonth'] ?? ''),
      expiryYear: String(src['expiryYear'] ?? ''),
      cvc: String(src['cvc'] ?? '')
    }
  };
}

export function normalizeProofOfDelivery(value: unknown): NewOrderFormValue['details']['proofOfDelivery'] {
  if (!value || typeof value !== 'object') {
    return { signature: false, picture: false };
  }
  const record = value as Record<string, unknown>;
  return {
    signature: Boolean(record['signature']),
    picture: Boolean(record['picture'])
  };
}

/** Extracts the driver-captured POD submission (if any) from the raw proof_of_delivery JSON.
 * Server file paths are deliberately not exposed — images are fetched via the API by kind. */
export function normalizePodSubmission(value: unknown): ProofOfDeliverySubmission | null {
  if (!value || typeof value !== 'object') return null;
  const submission = (value as Record<string, unknown>)['submission'];
  if (!submission || typeof submission !== 'object') return null;

  const record = submission as Record<string, unknown>;
  const hasSignature = Boolean(record['signature_path']);
  const hasPhoto = Boolean(record['photo_path']);
  if (!hasSignature && !hasPhoto) return null;

  return {
    recipientName: String(record['recipient_name'] ?? ''),
    hasSignature,
    hasPhoto,
    signatureUploadedAt: record['signature_uploaded_at'] ? String(record['signature_uploaded_at']) : null,
    photoUploadedAt: record['photo_uploaded_at'] ? String(record['photo_uploaded_at']) : null,
    note: record['note'] ? String(record['note']) : null
  };
}

/** Normalizes the pickup verification JSON. The stored file path stays server-side —
 * the parcel photo is fetched through the API, same as the POD images. */
export function normalizePickupVerification(value: unknown): PickupVerification | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const method = record['method'] === 'photo' ? 'photo' : 'qr';

  return {
    method,
    verifiedAt: record['verified_at'] ? String(record['verified_at']) : '',
    note: record['note'] ? String(record['note']) : null,
    hasPhoto: Boolean(record['photo_path'])
  };
}

export function isExpiredUnassignedBackendOrder(order: BackendOrder): boolean {
  if (!order.published || order.driver?.id) return false;
  if (!order.published_at) return false;

  const publishedAt = new Date(order.published_at).getTime();
  return Number.isFinite(publishedAt) && Date.now() - publishedAt >= PUBLISH_WINDOW_MS;
}

/** Maps a raw backend order to the frontend OrderEntity shape. `isDriver` controls
 * whether the "amount" view field shows the tenant total or the driver's earnings cut. */
export function mapBackendOrder(order: BackendOrder, isDriver: boolean): OrderEntity {
  const pickupPhone = splitPhoneNumber(order.pickup_phone);
  const deliveryPhone = splitPhoneNumber(order.delivery_phone);
  const payment = mapPaymentDetails(order.payment_method, order.payment_details);
  const isExpiredUnassigned = isExpiredUnassignedBackendOrder(order);

  const view: OrderView = {
    orderNo: order.order_number,
    customerName: order.delivery_name,
    vendorName: order.pickup_name,
    amount: isDriver ? driverEarningsLabel(order.driver_payout) : money(order.total),
    distance: '?',
    orderPlacedTime: order.order_placed_time || '',
    pickupTime: formatTime(plannedTime(order.pickup_planned_at, order.pickup_time_specified) ?? '') || 'Any time',
    estDeliveryTime: formatDateTime(
      plannedDate(order.delivery_planned_at),
      plannedTime(order.delivery_planned_at, order.delivery_time_specified) ?? ''
    ),
    readyForPickup: order.ready_for_pickup ?? false,
    driver: order.driver?.contact_name || order.driver?.name || '',
    orderStatus: isExpiredUnassigned ? 'Unassigned' : formatStatusLabel(order.status),
    trackingStatus: 'Inactive',
    activityStatus: order.activity_status
  };

  return {
    id: order.id,
    createdAt: order.created_at ?? undefined,
    isExpiredUnassigned,
    full: {
      orderNumber: order.order_number,
      deliveryCategoryId: order.delivery_category_id || '',
      surchargeIds: order.surcharge_ids || [],
      routeQuote: order.route_distance_meters != null ? {
        eligible: true,
        pickup_city: '',
        pickup_zone_id: '',
        pickup_zone_name: '',
        delivery_city: '',
        delivery_zone_id: '',
        delivery_zone_name: '',
        distance_meters: order.route_distance_meters,
        distance_km: Math.round(order.route_distance_meters / 10) / 100,
        duration_seconds: order.route_duration_seconds || 0,
        radius_km: 0,
        extra_distance_km: 0,
        base_price: order.delivery_fees,
        additional_per_km: 0,
        distance_charge: 0,
        applied_charges: order.applied_charges || [],
        delivery_fee: order.delivery_fees,
        gst_rate: order.gst_rate ?? 0,
        pst_rate: order.pst_rate ?? 0,
      } : null,
      pickup: {
        name: order.pickup_name,
        phone: pickupPhone,
        email: order.pickup_email,
        address: order.pickup_address,
        location: mapSelectedPlace(
          order.pickup_place_id,
          order.pickup_address,
          order.pickup_latitude,
          order.pickup_longitude
        ),
        pickupDate: plannedDate(order.pickup_planned_at),
        pickupTime: plannedTime(order.pickup_planned_at, order.pickup_time_specified) ?? '',
        pickupTimeSpecified: order.pickup_time_specified
      },
      delivery: {
        name: order.delivery_name,
        phone: deliveryPhone,
        email: order.delivery_email,
        address: order.delivery_address,
        location: mapSelectedPlace(
          order.delivery_place_id,
          order.delivery_address,
          order.delivery_latitude,
          order.delivery_longitude
        ),
        deliveryDate: plannedDate(order.delivery_planned_at),
        deliveryTime: plannedTime(order.delivery_planned_at, order.delivery_time_specified) ?? '',
        deliveryTimeSpecified: order.delivery_time_specified
      },
      details: {
        items: (order.items || []).map((item) => ({
          itemName: item.itemName,
          itemPrice: String(item.itemPrice),
          itemQty: String(item.itemQty)
        })),
        subtotal: order.subtotal,
        gstRate: order.gst_rate ?? 0,
        gstAmount: order.gst_amount ?? 0,
        pstRate: order.pst_rate ?? 0,
        pstAmount: order.pst_amount ?? 0,
        deliveryFees: order.delivery_fees,
        deliveryTips: order.delivery_tips,
        discount: order.discount,
        total: order.total,
        driverPayout: order.driver_payout ?? 0,
        driverFeePayout: order.driver_fee_payout ?? 0,
        driverTipPayout: order.driver_tip_payout ?? 0,
        driverPaymentRule: order.driver_payment_rule ?? null,
        instructions: order.instructions || '',
        payment,
        proofOfDelivery: normalizeProofOfDelivery(order.proof_of_delivery),
        podSubmission: normalizePodSubmission(order.proof_of_delivery),
        pickupVerification: normalizePickupVerification(order.pickup_verification),
        incidentReport: order.incident_report ?? null
      }
    },
    tab: order.status,
    view: {
      current: { ...view },
      scheduled: { ...view },
      completed: { ...view },
      incomplete: { ...view },
      history: { ...view }
    }
  };
}

export function toOrderPayload(value: NewOrderFormValue): Record<string, unknown> {
  const pickupAt = toPlannedAt(
    value.pickup.pickupDate,
    value.pickup.pickupTimeSpecified ? value.pickup.pickupTime : null,
  );
  const deliveryAt = toPlannedAt(
    value.delivery.deliveryDate,
    value.delivery.deliveryTimeSpecified ? value.delivery.deliveryTime : null,
  );
  return {
    delivery_category_id: value.deliveryCategoryId || null,
    surcharge_ids: value.surchargeIds,
    pickup_place_id: value.pickup.location?.placeId || null,
    pickup_latitude: value.pickup.location?.latitude ?? null,
    pickup_longitude: value.pickup.location?.longitude ?? null,
    pickup_name: value.pickup.name.trim(),
    pickup_phone: `${value.pickup.phone.countryCode}${value.pickup.phone.number}`,
    pickup_email: value.pickup.email.trim(),
    pickup_address: value.pickup.address.trim(),
    pickup_planned_at: pickupAt.plannedAt,
    pickup_time_specified: pickupAt.timeSpecified,
    delivery_name: value.delivery.name.trim(),
    delivery_phone: `${value.delivery.phone.countryCode}${value.delivery.phone.number}`,
    delivery_email: value.delivery.email.trim(),
    delivery_address: value.delivery.address.trim(),
    delivery_place_id: value.delivery.location?.placeId || null,
    delivery_latitude: value.delivery.location?.latitude ?? null,
    delivery_longitude: value.delivery.location?.longitude ?? null,
    delivery_planned_at: deliveryAt.plannedAt,
    delivery_time_specified: deliveryAt.timeSpecified,
    items: value.details.items
      .filter((item) => item.itemName.trim() && toNumber(item.itemPrice) > 0 && toNumber(item.itemQty) > 0)
      .map((item) => ({
        itemName: item.itemName.trim(),
        itemPrice: toNumber(item.itemPrice),
        itemQty: Math.round(toNumber(item.itemQty))
      })),
    subtotal: value.details.subtotal,
    gst_rate: value.details.gstRate,
    gst_amount: value.details.gstAmount,
    pst_rate: value.details.pstRate,
    pst_amount: value.details.pstAmount,
    delivery_fees: value.details.deliveryFees,
    delivery_tips: value.details.deliveryTips,
    discount: value.details.discount,
    total: value.details.total,
    instructions: value.details.instructions.trim(),
    payment_method: value.details.payment.method,
    proof_of_delivery: value.details.proofOfDelivery,
    payment_details: value.details.payment.method === 'credit_card'
      ? { creditCard: value.details.payment.creditCard }
      : null
  };
}

function todayYYYYMMDD(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function createDefaultNewOrder(): NewOrderFormValue {
  return {
    orderNumber: '',
    deliveryCategoryId: '',
    surchargeIds: [],
    routeQuote: null,
    pickup: { name: '', phone: { countryCode: '+1', number: '' }, email: '', address: '', location: null, pickupDate: todayYYYYMMDD(), pickupTime: '', pickupTimeSpecified: false },
    delivery: { name: '', phone: { countryCode: '+1', number: '' }, email: '', address: '', location: null, deliveryDate: todayYYYYMMDD(), deliveryTime: '', deliveryTimeSpecified: false },
    details: {
      items: [{ itemName: '', itemPrice: '', itemQty: '' }],
      gstRate: 0, pstRate: 0, deliveryFees: 0, deliveryTips: 0, discount: 0,
      subtotal: 0, gstAmount: 0, pstAmount: 0, total: 0,
      instructions: '', payment: { method: 'cash_on_delivery' },
      proofOfDelivery: { signature: false, picture: false },
      incidentReport: null
    }
  };
}

function formatDateForInput(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function formatTimeForInput(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

// ─── Demo fill data (form only, no table seeding) ──────────────────────────
export function buildDemoDraftValue(): NewOrderFormValue {
  const now = new Date();
  const pickupAt = new Date(now.getTime() + 1 * 3600000);
  const deliveryAt = new Date(now.getTime() + 2 * 3600000);

  return {
    orderNumber: `DEMO-${Date.now()}`,
    deliveryCategoryId: '',
    surchargeIds: [],
    routeQuote: null,
    pickup: {
      name: 'North Fork Kitchen',
      phone: { countryCode: '+1', number: '4161234567' },
      email: 'sender@dispatch.com',
      address: '32315 South Fraser Way, Abbotsford, BC V2T 1W7, Canada',
      location: null,
      pickupDate: formatDateForInput(pickupAt),
      pickupTime: formatTimeForInput(pickupAt),
      pickupTimeSpecified: true
    },
    delivery: {
      name: 'Maya Chen',
      phone: { countryCode: '+1', number: '4169876543' },
      email: `demo+${Date.now()}@dispatch.local`,
      address: '1890 McCallum Rd, Abbotsford, BC V2S 3N2, Canada',
      location: null,
      deliveryDate: formatDateForInput(deliveryAt),
      deliveryTime: formatTimeForInput(deliveryAt),
      deliveryTimeSpecified: true
    },
    details: {
      items: [{ itemName: 'Burger Combo', itemPrice: '14', itemQty: '2' }],
      gstRate: 5,
      pstRate: 8,
      deliveryFees: 4,
      deliveryTips: 1.5,
      discount: 0,
      subtotal: 28,
      gstAmount: 1.4,
      pstAmount: 2.24,
      total: 37.14,
      instructions: 'Call on arrival.',
      payment: { method: 'cash_on_delivery' },
      proofOfDelivery: { signature: false, picture: false },
      incidentReport: null
    }
  };
}
