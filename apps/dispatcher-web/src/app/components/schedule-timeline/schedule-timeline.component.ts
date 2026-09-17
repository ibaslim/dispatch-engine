import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { formatDateTime, formatTime } from '@pages/orders/orders-formatting.util';
import { formatRelativeStop, minutesUntilStop, stopCountdownTint } from '@pages/orders/order-countdown.util';

/** One stop's address plus, when it's scheduled, its time and countdown pill. */
interface StopRow {
  address: string;
  time: string | null;
  countdown: { text: string; color: string; background: string } | null;
}

/**
 * Pickup -> drop as a node-and-connector timeline, same shape language as the
 * driver mobile app's order screen: a filled dot for pickup, a filled square
 * for drop, joined by a line. Each scheduled stop gets its clock time plus a
 * green-to-red countdown pill; an "any time" stop gets neither.
 */
@Component({
  selector: 'app-schedule-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schedule-timeline.component.html',
})
export class ScheduleTimelineComponent {
  @Input() pickupAddress = '';
  @Input() pickupDate = '';
  @Input() pickupTime = '';
  @Input() pickupTimeSpecified = false;

  @Input() deliveryAddress = '';
  @Input() deliveryDate = '';
  @Input() deliveryTime = '';
  @Input() deliveryTimeSpecified = false;

  get pickup(): StopRow {
    return this.toRow(this.pickupAddress, this.pickupDate, this.pickupTime, this.pickupTimeSpecified);
  }

  get delivery(): StopRow {
    return this.toRow(this.deliveryAddress, this.deliveryDate, this.deliveryTime, this.deliveryTimeSpecified);
  }

  private toRow(address: string, date: string, time: string, timeSpecified: boolean): StopRow {
    if (!timeSpecified || !time) {
      return { address, time: null, countdown: null };
    }

    const minutes = minutesUntilStop(date, time, timeSpecified);
    const tint = minutes != null ? stopCountdownTint(minutes) : null;

    return {
      address,
      time: formatDateTime(date, time) || formatTime(time),
      countdown: minutes != null && tint ? { text: formatRelativeStop(minutes), ...tint } : null,
    };
  }
}
