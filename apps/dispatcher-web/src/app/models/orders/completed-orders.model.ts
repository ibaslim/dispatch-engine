export interface CompletedOrder {
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
    reqDeliveryTime: string;
    deliveryTime: string;
    driver: string;
    feedback: string;
}