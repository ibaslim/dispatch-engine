import { NewOrderFormValue } from '../new-order-form/new-order-form.model';
import { Order } from './current-orders.model';
import { ScheduledOrder } from './scheduled-orders.model';
import { CompletedOrder } from './completed-orders.model';
import { IncompleteOrder } from './incomplete-orders.model';
import { HistoryOrder } from './history-orders.model';

export type OrderTab =
    | 'current'
    | 'scheduled'
    | 'completed'
    | 'incomplete'
    | 'history';

export interface OrderEntity {
    id: string;
    tab: OrderTab;
    full: NewOrderFormValue;

    view: {
        current?: Order;
        scheduled?: ScheduledOrder;
        completed?: CompletedOrder;
        incomplete?: IncompleteOrder;
        history?: HistoryOrder;
    };
}