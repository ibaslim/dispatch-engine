import { PhoneValue } from "../phone-input/phone-input.model";

export type PaymentMethodType = 'cash_on_delivery' | 'credit_card';

export interface CreditCardDetails {
    cardholderName: string;
    cardNumber: string;
    expiryMonth: string; // "01".."12"
    expiryYear: string;  // "2026"
    cvc: string;         // "123"
}

export interface PaymentDetails {
    method: PaymentMethodType;
    creditCard?: CreditCardDetails;
}

export interface NewOrderFormValue {
    orderNumber: string;

    pickup: {
        name: string;
        phone: PhoneValue;
        address: string;
        pickupTime: string; // HH:mm
    };

    delivery: {
        name: string;
        phone: PhoneValue;
        email: string;
        address: string;
        deliveryDate: string; // YYYY-MM-DD
        deliveryTime: string; // HH:mm
    };

    details: {
        itemName: string;
        itemPrice: number;
        itemQty: number;

        taxRate: number;
        deliveryFees: number;
        deliveryTips: number;
        discount: number;

        subtotal: number;
        taxAmount: number;
        total: number;

        instructions: string;

        payment: PaymentDetails;
    };
}