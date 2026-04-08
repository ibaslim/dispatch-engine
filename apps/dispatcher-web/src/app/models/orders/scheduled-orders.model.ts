export interface ScheduledOrder {
    select?: boolean;
    orderNo: string;
    customerName: string;
    pickup: string;
    amount: string;
    distance: string;
    placementTime: string;
    estDeliveryTime: string;
    elapsedTime: string;
    driver: string;
    status: string;
}