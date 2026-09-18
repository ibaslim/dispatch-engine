import { PhoneValue } from "../phone-input/phone-input.model";
import { SelectedGooglePlace } from '../../services/google-maps/google-maps.service';

export type PaymentMethodType = 'cash_on_delivery' | 'credit_card';

export interface CreditCardDetails {
    cardholderName: string;
    cardNumber: string;
    expiryMonth: string;
    expiryYear: string;
    cvc: string;
}

export interface ProofOfDeliveryValue {
    signature: boolean;
    picture: boolean;
}

export type ManualDiscountKind = 'percentage' | 'fixed_amount';

export type ManualDiscountReason =
    | 'late_delivery'
    | 'damaged_item'
    | 'wrong_address_our_fault'
    | 'sales_goodwill'
    | 'price_correction'
    | 'other';

/** A discount the dispatcher enters. Value stays a string while being typed. */
export interface ManualDiscountValue {
    kind: ManualDiscountKind;
    value: string;
    reason: ManualDiscountReason;
    note: string;
}

/** A priced discount line the server applied to the order. */
export interface AppliedDiscountLine {
    source: string;
    kind: string;
    label: string;
    value: number;
    amount: number;
    reason: string | null;
    note: string | null;
}

/** What the driver actually captured at delivery time (read-only, set by backend). */
export interface ProofOfDeliverySubmission {
    recipientName: string;
    hasSignature: boolean;
    hasPhoto: boolean;
    signatureUploadedAt: string | null;
    photoUploadedAt: string | null;
    note: string | null;
}


export interface PickupVerification {
    method: 'qr' | 'photo';
    verifiedAt: string;
    note: string | null;
    hasPhoto: boolean;
}

export interface OrderIncidentReport {
    id: string;
    stage: 'pickup' | 'delivery';
    reason: string;
    description: string | null;
    reported_by: string | null;
    reported_at: string;
}
export interface PaymentDetails {
    method: PaymentMethodType;
    creditCard?: CreditCardDetails;
}

export interface NewOrderFormValue {
    orderNumber: string;
    deliveryCategoryId: string;
    surchargeIds: string[];
    routeQuote: DeliveryRouteQuote | null;

    pickup: {
        name: string;
        phone: PhoneValue;
        email:string,
        address: string;
        location: SelectedGooglePlace | null;
        pickupDate: string;
        pickupTime: string;
        // Ticked "Set a specific time"; pickupTime is ignored when false.
        pickupTimeSpecified: boolean;
    };

    delivery: {
        name: string;
        phone: PhoneValue;
        email: string;
        address: string;
        location: SelectedGooglePlace | null;
        deliveryDate: string;
        deliveryTime: string;
        deliveryTimeSpecified: boolean;
    };

    details: {
        items: {
            itemName: string;
            itemPrice: string;
            itemQty: string;
        }[];

        gstRate: number;
        pstRate: number;
        deliveryFees: number;
        deliveryTips: number;
        /** Priced from manualDiscount and capped at the delivery fee. */
        discount: number;
        manualDiscount: ManualDiscountValue | null;
        appliedDiscounts: AppliedDiscountLine[];

        subtotal: number;
        gstAmount: number;
        pstAmount: number;
        total: number;
        driverPayout?: number;
        driverFeePayout?: number;
        driverTipPayout?: number;
        driverPaymentRule?: string | null;

        instructions: string;
        payment: PaymentDetails;

        proofOfDelivery: ProofOfDeliveryValue;
        podSubmission?: ProofOfDeliverySubmission | null;
        pickupVerification?: PickupVerification | null;
        incidentReport: OrderIncidentReport | null;
    };
}

export interface DeliveryRouteQuote {
    eligible: boolean;
    pickup_city: string;
    pickup_zone_id: string;
    pickup_zone_name: string;
    delivery_city: string;
    delivery_zone_id: string;
    delivery_zone_name: string;
    distance_meters: number;
    distance_km: number;
    duration_seconds: number;
    radius_km: number;
    extra_distance_km: number;
    base_price: number;
    additional_per_km: number;
    distance_charge: number;
    applied_charges: AppliedCharge[];
    delivery_fee: number;
    gst_rate: number;
    pst_rate: number;
    manual_fallback?: boolean;
}

export interface AppliedCharge {
    id: string | null;
    kind: 'after_hours' | 'surcharge' | 'special_occasion';
    label: string;
    amount: number;
}
