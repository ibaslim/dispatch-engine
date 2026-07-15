import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderEntity } from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { AuthService } from '@core/auth/auth.service';
import { ToastService } from '@core/toast/toast.service';
import { BackendOrder, mapBackendOrder } from '@pages/orders/orders-mapping.util';

/**
 * Driver-facing real-time "New Orders" feed: connects to the tenant websocket,
 * lists newly published orders with a 15-minute accept countdown, and lets the
 * driver accept one. Extracted from OrdersComponent.
 */
@Component({
  selector: 'app-published-orders-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './published-orders-feed.component.html'
})
export class PublishedOrdersFeedComponent implements OnInit, OnDestroy {
  @Output() accepted = new EventEmitter<OrderEntity>();
  /** Emitted when the websocket reports another accept, so the parent can refresh its order list. */
  @Output() refresh = new EventEmitter<void>();

  publishedOrders: any[] = [];

  private ws: WebSocket | null = null;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly auth: AuthService,
    private readonly toast: ToastService
  ) { }

  ngOnInit(): void {
    this.loadPublishedOrders();
    this.connectWebSocket();
    this.countdownHandle = setInterval(() => this.tickCountdowns(), 1000);
  }

  ngOnDestroy(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
    }
    this.ws?.close();
  }

  private connectWebSocket(): void {
    const token = this.auth.getAccessToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/api/v1/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.type === 'new_order') {
            const o = msg.order;
            if (!o || this.publishedOrders.some(p => p.id === String(o.id))) return;

            const publishedAt = o.published_at ? new Date(o.published_at) : new Date();
            const elapsed = Math.floor((Date.now() - publishedAt.getTime()) / 1000);
            const remaining = Math.max(0, 900 - elapsed); // 15 mins

            this.publishedOrders = [{
              id: String(o.id),
              orderNumber: String(o.order_number ?? ''),
              pickupAddress: String(o.pickup_address ?? ''),
              deliveryAddress: String(o.delivery_address ?? ''),
              total: Number(o.total ?? 0),
              driverFee: Number(o.driver_fee ?? 0),
              publishedAt,
              remainingSeconds: remaining,
              accepting: false,
              accepted: false,
            }, ...this.publishedOrders];
          } else if (msg.type === 'order_accepted') {
            this.publishedOrders = this.publishedOrders.filter(p => p.id !== String(msg.order_id));
            this.refresh.emit();
          }
        } catch { /* ignore */ }
      };
      this.ws.onclose = () => setTimeout(() => this.connectWebSocket(), 5000);
    } catch { /* ignore */ }
  }

  private loadPublishedOrders(): void {
    this.ordersService.getPublishedOrders().subscribe({
      next: (orders) => {
        const now = Date.now();
        this.publishedOrders = orders.map(o => {
          const publishedAt = o.published_at ? new Date(o.published_at) : new Date();
          const elapsed = Math.floor((now - publishedAt.getTime()) / 1000);
          return {
            id: String(o.id),
            orderNumber: String(o.order_number ?? ''),
            pickupAddress: String(o.pickup_address ?? ''),
            deliveryAddress: String(o.delivery_address ?? ''),
            total: Number(o.total ?? 0),
            driverFee: Math.round(Number(o.total ?? 0) * 0.05 * 100) / 100,
            publishedAt,
            remainingSeconds: Math.max(0, 900 - elapsed),
            accepting: false,
            accepted: false,
          };
        }).filter(o => o.remainingSeconds > 0);
      }
    });
  }

  private tickCountdowns(): void {
    let changed = false;
    for (const card of this.publishedOrders) {
      if (card.remainingSeconds > 0) {
        card.remainingSeconds--;
        changed = true;
      }
    }
    const before = this.publishedOrders.length;
    this.publishedOrders = this.publishedOrders.filter(p => p.remainingSeconds > 0 || p.accepting);
    if (changed || this.publishedOrders.length !== before) {
      this.publishedOrders = [...this.publishedOrders];
    }
  }

  async acceptOrder(card: any): Promise<void> {
    if (card.accepting || card.accepted || card.remainingSeconds <= 0) return;
    card.accepting = true;
    try {
      const acceptedOrder = await firstValueFrom(this.ordersService.acceptOrder(card.id));
      const mappedOrder = mapBackendOrder(acceptedOrder as BackendOrder, this.auth.isDriver());
      card.accepted = true;
      this.publishedOrders = this.publishedOrders.filter(p => p.id !== card.id);
      this.accepted.emit(mappedOrder);
    } catch (err: any) {
      this.toast.error(err?.error?.detail || 'Failed to accept order.');
      if (err?.status === 409 || err?.status === 410) {
        this.publishedOrders = this.publishedOrders.filter(p => p.id !== card.id);
      }
    } finally {
      card.accepting = false;
    }
  }

  countdownPercent(card: any): number { return Math.round((card.remainingSeconds / 900) * 100); }

  countdownLabel(card: any): string {
    const m = Math.floor(card.remainingSeconds / 60);
    const s = card.remainingSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  countdownColor(card: any): string {
    const pct = this.countdownPercent(card);
    if (pct > 50) return 'bg-emerald-500';
    if (pct > 20) return 'bg-amber-400';
    return 'bg-red-500';
  }
}
