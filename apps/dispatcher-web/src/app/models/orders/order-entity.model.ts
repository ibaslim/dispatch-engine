import { NewOrderFormValue } from '../new-order-form/new-order-form.model';
import { OrderView } from './order-tabs.model';

export type OrderTab =
    | 'current'
    | 'scheduled'
    | 'completed'
    | 'incomplete'
    | 'history'
    |'disputed';

export type OrderActivityStatus ='driver_not_assigned'| 'pickup_initiated'|'picked_up'|'delivery_initiated'|'delivery_in_progress'|'delivered'

export interface OrderEntity {
    id: string;
    tab: OrderTab;
    full: NewOrderFormValue;
    createdAt?: string;
    isExpiredUnassigned?: boolean;

    view: {
        current: OrderView;
        scheduled: OrderView;
        completed: OrderView;
        incomplete: OrderView;
        history: OrderView;
    };
}
