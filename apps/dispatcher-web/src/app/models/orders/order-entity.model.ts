import { NewOrderFormValue } from '../new-order-form/new-order-form.model';
import { OrderView } from './order-tabs.model';
import type { ActivityStatus, OrderStatus } from '@dispatch/shared/contracts';

// 'disputed' is a UI-only tab; the rest are the API's order statuses.
export type OrderTab = OrderStatus | 'disputed';

export type OrderActivityStatus = ActivityStatus;

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
