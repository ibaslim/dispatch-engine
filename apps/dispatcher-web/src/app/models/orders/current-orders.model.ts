export interface Order {
    orderNo: string;
    customer: string;
    pickup: string;
    amount: string;
    distance: string;
    placed: string;
    reqPickup: string;
    reqDelivery: string;
    ready: boolean;
    driver: string;
    status: string;
    tracking: string;
}