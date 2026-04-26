export type DriverStatus = 'On Duty' | 'Off Duty' | 'On Delivery';

export interface DriverEntity {
    id: string;
    name: string;
    email: string;
    phoneCountryCode: string;
    phoneNumber: string;
    vehicle: string;
    rating: number;
    status: DriverStatus;
    completedDeliveries: number;
    basePay: number;
    tips: number;
    adjustments: number;
}

export interface DriverFormValue {
    name: string;
    email: string;
    phone: {
        countryCode: string;
        number: string;
    };
    vehicle: string;
    rating: string;
    status: DriverStatus;
    completedDeliveries: string;
    basePay: string;
    tips: string;
    adjustments: string;
}
