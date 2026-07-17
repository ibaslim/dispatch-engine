
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { form, required, FormField } from '@angular/forms/signals';
import { OrderProgressComponent } from '@components/order-progress/order-progress.component';
import {
  DispatchStage,
  DispatchTruckTrackerComponent,
} from '@components/dispatch-truck-animation/dispatch-truck-tracker.component';
import { TrackingService } from '@services/tracking.service';
import { OrderTrackingDetails } from '@models/order-tracking.model';

/** Maps an order's activity_status to a stage index in DISPATCH_STAGES / order-progress. */
const ACTIVITY_TO_STAGE_INDEX: Record<string, number> = {
  driver_not_assigned: 0,
  pickup_initiated: 1,
  picked_up: 2,
  delivery_initiated: 2,
  delivery_in_progress: 3,
  delivered: 4,
};

const DISPATCH_STAGES: DispatchStage[] = [
  {
    key: 'DISPATCHED',
    label: 'Dispatched',
    name: 'Order dispatched',
    sub: 'Your parcel has left the depot.',
  },
  {
    key: 'PICKED_UP',
    label: 'Picked up',
    name: 'Parcel picked up',
    sub: 'The driver has collected your parcel.',
  },
  {
    key: 'IN_TRANSIT',
    label: 'In transit',
    name: 'On the road',
    sub: 'Your parcel is moving through the network.',
  },
  {
    key: 'OUT_FOR_DELIVERY',
    label: 'Out for delivery',
    name: 'Out for delivery',
    sub: 'The driver is heading to your address.',
  },
  {
    key: 'DELIVERED',
    label: 'Delivered',
    name: 'Delivered',
    sub: 'Your parcel has arrived.',
  },
];

@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [FormField, OrderProgressComponent, DispatchTruckTrackerComponent],
  templateUrl: './tracking.component.html',
})
export class TrackingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly trackingService = inject(TrackingService);

  readonly searchModel = signal({ orderNumber: '' });
  readonly searchForm = form(this.searchModel, (path) => {
    required(path.orderNumber);
  });

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  order = signal<OrderTrackingDetails | null>(null);

  private routeSub: Subscription | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  readonly dispatchStages = DISPATCH_STAGES;

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const token = params.get('token');
      this.stopPolling();
      if (!token) {
        this.order.set(null);
        this.errorMessage.set(null);
        return;
      }
      this.searchModel.set({ orderNumber: token });
      this.isLoading.set(true);
      this.loadOrder(token);
      this.pollInterval = setInterval(() => this.loadOrder(token), 30_000);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.stopPolling();
  }

  dispatchStageIndex(): number {
    const status = this.order()?.activity_status ?? '';
    return ACTIVITY_TO_STAGE_INDEX[status] ?? 0;
  }

  search(): void {
    const value = this.searchModel().orderNumber.trim();
    if (!value) return;
    this.router.navigate(['/t', value]);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async loadOrder(token: string): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.trackingService.getOrderDetails(token)
      );
      this.order.set(data);
      this.errorMessage.set(null);
    } catch {
      this.order.set(null);
      this.errorMessage.set('We could not find that order');
      this.stopPolling();
    } finally {
      this.isLoading.set(false);
    }
  }

  activityLabel(): string {
    const s = this.order()?.activity_status ?? '';
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  activityClass(): string {
    const s = this.order()?.activity_status ?? '';
    switch (s) {
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'delivery_in_progress':
      case 'delivery_initiated': return 'bg-blue-100 text-blue-800';
      case 'picked_up': return 'bg-indigo-100 text-indigo-800';
      case 'pickup_initiated': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}