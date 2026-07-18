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

/** What the driver actually captured at delivery time (read-only, set by backend). */
export interface ProofOfDeliverySubmission {
    recipientName: string;
    hasSignature: boolean;
    hasPhoto: boolean;
    signatureUploadedAt: string | null;
    photoUploadedAt: string | null;
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
    };

    delivery: {
        name: string;
        phone: PhoneValue;
        email: string;
        address: string;
        location: SelectedGooglePlace | null;
        deliveryDate: string;
        deliveryTime: string;
    };

    details: {
        items: {
            itemName: string;
            itemPrice: string;
            itemQty: string;
        }[];

        taxRate: number;
        deliveryFees: number;
        deliveryTips: number;
        discount: number;

        subtotal: number;
        taxAmount: number;
        total: number;

        instructions: string;
        payment: PaymentDetails;

        proofOfDelivery: ProofOfDeliveryValue;
        podSubmission?: ProofOfDeliverySubmission | null;
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
}

export interface AppliedCharge {
    id: string | null;
    kind: 'after_hours' | 'surcharge' | 'special_occasion';
    label: string;
    amount: number;
}
