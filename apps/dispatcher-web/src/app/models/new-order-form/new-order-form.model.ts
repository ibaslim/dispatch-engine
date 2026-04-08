import { PhoneValue } from "../phone-input/phone-input.model";

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
        itemPrice: number; // changed to number
        itemQty: number;   // changed to number

        taxRate: number;   // % changed to number
        deliveryFees: number;
        deliveryTips: number;
        discount: number;

        // backend-required computed values:
        subtotal: number;
        taxAmount: number;
        total: number;

        instructions: string;
        paymentMethod: string;
    };
}