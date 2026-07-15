import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderEntity } from '@models/orders/order-entity.model';
import { OrdersService } from './orders.service';
import { parseDateTime } from '@pages/orders/orders-formatting.util';

/**
 * Polling logic that promotes "scheduled" orders to "current" once their pickup
 * is within 24 hours — extracted from OrdersComponent.checkAndUpdateScheduledOrders.
 * The component still owns the `orders` array/interval and is notified via the
 * `onPromoted` callback so it can reload.
 */
@Injectable({ providedIn: 'root' })
export class ScheduledOrderPromotionService {
  private inFlight = false;

  constructor(private readonly ordersService: OrdersService) { }

  async checkAndUpdateScheduledOrders(
    orders: OrderEntity[],
    onPromoted: () => void,
    onError: (message: string) => void
  ): Promise<void> {
    if (this.inFlight) return;

    this.inFlight = true;

    try {
      const now = new Date();
      const twentyFourHoursLater = now.getTime() + (24 * 60 * 60 * 1000); // 24 hours from now

      const candidateIds: string[] = [];

      for (const order of orders) {
        if (order.tab !== 'scheduled') continue;

        const pickupDateTime = parseDateTime(
          order.full.pickup.pickupDate,
          order.full.pickup.pickupTime
        );

        if (pickupDateTime && pickupDateTime.getTime() <= twentyFourHoursLater) {
          candidateIds.push(order.id);
        }
      }

      if (candidateIds.length === 0) {
        console.log('No scheduled orders ready to move to Current yet.');
        return;
      }

      console.log(`Promoting ${candidateIds.length} order(s) to Current (within 24 hours of pickup)`);

      // Move them to Current tab
      await Promise.all(
        candidateIds.map(id =>
          firstValueFrom(this.ordersService.updateStatus(id, 'current'))
        )
      );

      onPromoted();

    } catch (error) {
      console.error('Failed to promote scheduled orders:', error);
      onError('Unable to auto-update scheduled orders.');
    } finally {
      this.inFlight = false;
    }
  }
}
