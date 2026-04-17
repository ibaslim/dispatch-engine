import { PhoneValue } from "../phone-input/phone-input.model";

export type PaymentMethodType = 'cash_on_delivery' | 'credit_card';

export interface CreditCardDetails {
    cardholderName: string;
    cardNumber: string;
    expiryMonth: string;
    expiryYear: string;
    cvc: string;
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
        pickupTime: string;
    };

    delivery: {
        name: string;
        phone: PhoneValue;
        email: string;
        address: string;
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
    };
}