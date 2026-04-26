export interface OrderView {
    orderNo: string;
    customerName: string;
    vendorName: string;
    amount: string;
    distance: string;
    orderPlacedTime: string;
    pickupTime: string;
    estDeliveryTime: string;
    readyForPickup: boolean | string;
    driver: string;
    orderStatus: string;
    trackingStatus: string;
}
