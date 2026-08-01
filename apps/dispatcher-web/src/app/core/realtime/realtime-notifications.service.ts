import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { ToastService } from '@core/toast/toast.service';
import { OrderRealtimeEvent, PusherService } from './pusher.service';


const NOTIFICATIONS_KEY = 'dispatch:realtime_notifications';

@Injectable({ providedIn: 'root' })
export class RealtimeNotificationsService {
  private readonly pusher = inject(PusherService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly audio = new Audio('assets/sounds/notify.mp3');
  private subscription: Subscription | null = null;

  readonly enabled = signal(localStorage.getItem(NOTIFICATIONS_KEY) !== 'off');

  start(): void {
    if (this.subscription) return;
    this.subscription = this.pusher.orderEvents$.subscribe((event) => this.notify(event));
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  async toggle(): Promise<void> {
    const next = !this.enabled();
    this.enabled.set(next);
    localStorage.setItem(NOTIFICATIONS_KEY, next ? 'on' : 'off');

    if (next && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (next) {
      await this.playSound();
    }
  }

  private notify(event: OrderRealtimeEvent): void {
    if (!this.enabled() || event.actor_user_id === this.auth.currentUser()?.id) {
      return;
    }

    const message = this.messageFor(event);
    if (!message) return;

    if (event.event === 'order-incident-reported') {
      this.toast.warning(message);
    } else {
      this.toast.success(message);
    }
    void this.playSound();

    if (
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('Dispatch Engine', { body: message });
    }
  }

  private messageFor(event: OrderRealtimeEvent): string | null {
    const orderLabel = event.order_number ? ` ${event.order_number}` : '';
    switch (event.event) {
      case 'order-created':
        return `Order${orderLabel} was created.`;
      case 'order-updated':
        return `Order${orderLabel} was updated.`;
      case 'order-deleted':
        return `Order${orderLabel} was deleted.`;
      case 'order-status-changed':
        return `An order status changed${event.status ? ` to ${event.status}` : ''}.`;
      case 'order-activity-changed':
        return 'An order activity checkpoint was updated.';
      case 'order-ready-changed':
        return event.ready_for_pickup ? 'An order is ready for pickup.' : 'An order is no longer ready for pickup.';
      case 'order-driver-changed':
        return event.driver_name ? `An order was assigned to ${event.driver_name}.` : 'An order driver assignment changed.';
      case 'order-published':
        return this.auth.isDriver() ? `New order${orderLabel} is available.` : `Order${orderLabel} was published.`;
      case 'order-accepted':
        return event.driver_name ? `Order accepted by ${event.driver_name}.` : 'A published order was accepted.';
      case 'order-incident-reported':
        return 'A driver reported an order incident.';
      case 'order-pod-updated':
        return 'Proof of delivery was updated.';
      default:
        return null;
    }
  }

  private async playSound(): Promise<void> {
    this.audio.currentTime = 0;
    try {
      await this.audio.play();
    } catch {
      // Browsers may block audio until the user interacts with the page.
    }
  }
}
