import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { OrderActivityStatus } from '@models/orders/order-entity.model';
import { ACTIVITY_STATUS_FLOW, ACTIVITY_STATUS_SEQUENCE } from '@pages/orders/activity-flow.util';

interface StepView {
  status: OrderActivityStatus;
  label: string;
  done: boolean;
  current: boolean;
}

/** Vertical stepper over an order's activity statuses, same shape as the driver app's. */
@Component({
  selector: 'app-order-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-progress.component.html',
})
export class OrderProgressComponent {
  @Input() status: OrderActivityStatus = 'pickup_initiated';

  get steps(): StepView[] {
    const currentIndex = ACTIVITY_STATUS_SEQUENCE.indexOf(this.status);
    return ACTIVITY_STATUS_SEQUENCE.map((status, index) => ({
      status,
      label: ACTIVITY_STATUS_FLOW[status].label,
      done: currentIndex >= 0 && index < currentIndex,
      current: index === currentIndex,
    }));
  }
}
