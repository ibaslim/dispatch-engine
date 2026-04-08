export interface IncompleteOrder {
    select?: boolean;
    date: string;
    orderNo: string;
    customerName: string;
    pickup: string;
    amount: string;
    distance: string;
    placementTime: string;
    startTime: string;
    pickupTime: string;
    deliveryTime: string;
    driver: string;
    status: string;
    actions?: string;
}