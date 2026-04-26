import { NewOrderFormValue } from '../new-order-form/new-order-form.model';
import { OrderView } from './order-tabs.model';

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
        current: OrderView;
        scheduled: OrderView;
        completed: OrderView;
        incomplete: OrderView;
        history: OrderView;
    };
}