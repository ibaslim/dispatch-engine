import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { finalize, firstValueFrom } from 'rxjs';

import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';
import { OrdersService } from '../../services/orders/orders.service';
import { PaymentMethodType } from '../../models/new-order-form/new-order-form.model';
import { AuthService } from '../../core/auth/auth.service';

// ─── Backend types ──────────────────────────────────────────────────────────

type BackendOrderItem = { itemName: string; itemPrice: number; itemQty: number };

type BackendOrder = {
  id: string;
  order_number: string;
  pickup_name: string;
  pickup_phone: string;
  pickup_address: string;
  pickup_date: string;
  pickup_time: string;
  delivery_name: string;
  delivery_phone: string;
  delivery_email: string;
  delivery_address: string;
  delivery_date: string;
  delivery_time: string;
  items: BackendOrderItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  delivery_fees: number;
  delivery_tips: number;
  discount: number;
  total: number;
  instructions?: string | null;
  driver?: { id: string; name: string } | null;
  payment_method: PaymentMethodType;
  status: 'current' | 'scheduled' | 'completed' | 'incomplete' | 'history';
  ready_for_pickup: boolean;
  order_placed_time?: string | null;
  proof_of_delivery?: { signature: boolean; picture: boolean };
  published?: boolean;
  published_at?: string | null;
};

type DispatchOrder = {
  id: string;
  orderNumber: string;
  status: BackendOrder['status'];
  pickup: { name: string; phone: string; address: string; time: string; date: string };
  delivery: { name: string; phone: string; address: string; date: string; time: string };
  items: Array<{ name: string; price: number; qty: number }>;
  taxRate: number;
  deliveryFee: number;
  tip: number;
  discount: number;
  total: number;
  payment: string;
  instructions: string;
  assignedDriverId: string | null;
  assignedDriverName: string;
  proofOfDelivery: { signature: boolean; picture: boolean };
};

type DispatchDriverGroup = {
  id: string;
  name: string;
  status: string;
  orders: Array<{ id: string; label: string; pickup: string; dropoff: string; time: string }>;
};

/** A published order card shown to drivers in the New Orders panel. */
export type PublishedOrderCard = {
  id: string;
  orderNumber: string;
  pickupAddress: string;
  deliveryAddress: string;
  total: number;
  driverFee: number;       // 5% of total
  publishedAt: Date;
  remainingSeconds: number; // countdown (0 = expired)
  accepting: boolean;       // in-flight API call
  accepted: boolean;        // accepted by this client (hide immediately)
};

const WINDOW_MINUTES = 15;
const WINDOW_SECONDS = WINDOW_MINUTES * 60;

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './dispatch.component.html'
})
export class DispatchComponent implements OnInit, OnDestroy {

  // ─── State ──────────────────────────────────────────────────────────────────
  assignedDrivers: DispatchDriverGroup[] = [];
  selectedOrder: DispatchOrder | null = null;
  allOrders: DispatchOrder[] = [];
  newOrders: Array<{ id: string; realId: string; pickup: string; dropoff: string; eta: string; total: string }> = [];

  /** Published orders shown in the "New Orders" driver panel */
  publishedOrders: PublishedOrderCard[] = [];

  feedbackMessage = '';
  isLoading = false;

  // ─── DI ─────────────────────────────────────────────────────────────────────
  private readonly auth = inject(AuthService);
  private ws: WebSocket | null = null;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  get isReadOnlyTenant(): boolean { return !this.auth.isPlatformAdmin(); }
  get isDriver(): boolean { return this.auth.isDriver(); }

  constructor(private readonly ordersService: OrdersService) { }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadDispatchState();
    this.connectWebSocket();
    // If this is a driver, also fetch currently live published orders
    if (this.isDriver) {
      this.loadPublishedOrders();
    }
    // Countdown ticker — updates every second
    this.countdownHandle = setInterval(() => this.tickCountdowns(), 1000);
  }

  ngOnDestroy(): void {
    this.ws?.close();
    if (this.countdownHandle) clearInterval(this.countdownHandle);
  }

  // ─── WebSocket ───────────────────────────────────────────────────────────────

  private connectWebSocket(): void {
    const token = this.auth.getAccessToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/api/v1/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => console.log('[WS] Connected to dispatch');

      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          this.handleWsMessage(msg);
        } catch { /* ignore malformed */ }
      };

      this.ws.onclose = () => {
        // Reconnect after 5 seconds if not intentionally closed
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = () => this.ws?.close();
    } catch (err) {
      console.error('[WS] Failed to connect', err);
    }
  }

  private handleWsMessage(msg: Record<string, unknown>): void {
    const type = msg['type'] as string;

    if (type === 'new_order' && this.isDriver) {
      // A new order was published — add it to the panel
      const o = msg['order'] as Record<string, unknown>;
      if (!o) return;
      const id = String(o['id']);
      // Avoid duplicates
      if (this.publishedOrders.some(p => p.id === id)) return;

      const publishedAt = o['published_at'] ? new Date(o['published_at'] as string) : new Date();
      const elapsed = Math.floor((Date.now() - publishedAt.getTime()) / 1000);
      const remaining = Math.max(0, WINDOW_SECONDS - elapsed);

      this.publishedOrders = [
        {
          id,
          orderNumber: String(o['order_number'] ?? ''),
          pickupAddress: String(o['pickup_address'] ?? ''),
          deliveryAddress: String(o['delivery_address'] ?? ''),
          total: Number(o['total'] ?? 0),
          driverFee: Number(o['driver_fee'] ?? 0),
          publishedAt,
          remainingSeconds: remaining,
          accepting: false,
          accepted: false,
        },
        ...this.publishedOrders
      ];
    }

    if (type === 'order_accepted') {
      // Remove accepted card from all clients (another driver accepted)
      const orderId = String(msg['order_id']);
      this.publishedOrders = this.publishedOrders.filter(p => p.id !== orderId);
      // Reload assigned drivers panel
      this.loadDispatchState();
    }

    if (type === 'order_published') {
      // Admin published an order — if this is also an admin view, refresh dispatch
      this.loadDispatchState();
    }
  }

  // ─── Published orders ────────────────────────────────────────────────────────

  private loadPublishedOrders(): void {
    this.ordersService.getPublishedOrders().subscribe({
      next: (orders) => {
        const now = Date.now();
        this.publishedOrders = orders
          .map(o => {
            const publishedAt = o.published_at ? new Date(o.published_at) : new Date();
            const elapsed = Math.floor((now - publishedAt.getTime()) / 1000);
            const remaining = Math.max(0, WINDOW_SECONDS - elapsed);
            return {
              id: String(o.id),
              orderNumber: String(o.order_number ?? ''),
              pickupAddress: String(o.pickup_address ?? ''),
              deliveryAddress: String(o.delivery_address ?? ''),
              total: Number(o.total ?? 0),
              driverFee: Math.round(Number(o.total ?? 0) * 0.05 * 100) / 100,
              publishedAt,
              remainingSeconds: remaining,
              accepting: false,
              accepted: false,
            } as PublishedOrderCard;
          })
          .filter(o => o.remainingSeconds > 0);
      },
      error: () => { /* silently ignore — not critical */ }
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
    // Remove expired cards
    const before = this.publishedOrders.length;
    this.publishedOrders = this.publishedOrders.filter(p => p.remainingSeconds > 0 || p.accepting);
    if (changed || this.publishedOrders.length !== before) {
      // trigger change detection for the countdown display
      this.publishedOrders = [...this.publishedOrders];
    }
  }

  async acceptOrder(card: PublishedOrderCard): Promise<void> {
    if (card.accepting || card.accepted || card.remainingSeconds <= 0) return;
    card.accepting = true;

    try {
      const acceptedOrder = await firstValueFrom(this.ordersService.acceptOrder(card.id));
      this.selectedOrder = this.mapBackendOrder(acceptedOrder as BackendOrder);
      card.accepted = true;
      // Remove immediately from the list
      this.publishedOrders = this.publishedOrders.filter(p => p.id !== card.id);
      this.loadDispatchState();
    } catch (err: any) {
      const detail = err?.error?.detail || 'Failed to accept order.';
      this.feedbackMessage = detail;
      // If already taken, remove it
      if (err?.status === 409 || err?.status === 410) {
        this.publishedOrders = this.publishedOrders.filter(p => p.id !== card.id);
      }
    } finally {
      card.accepting = false;
    }
  }

  /** Countdown bar width as percentage (0-100) */
  countdownPercent(card: PublishedOrderCard): number {
    return Math.round((card.remainingSeconds / WINDOW_SECONDS) * 100);
  }

  /** Formatted MM:SS countdown */
  countdownLabel(card: PublishedOrderCard): string {
    const m = Math.floor(card.remainingSeconds / 60);
    const s = card.remainingSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Color class for the countdown bar */
  countdownColor(card: PublishedOrderCard): string {
    const pct = this.countdownPercent(card);
    if (pct > 50) return 'bg-emerald-500';
    if (pct > 20) return 'bg-amber-400';
    return 'bg-red-500';
  }

  // ─── Dispatch board loading ───────────────────────────────────────────────────

  refreshDispatchState(): void {
    if (this.isLoading) return;
    this.loadDispatchState();
    if (this.isDriver) this.loadPublishedOrders();
  }

  selectOrder(orderId: string): void {
    this.selectedOrder = this.allOrders.find(o => o.id === orderId) ?? null;
  }

  private loadDispatchState(): void {
    this.isLoading = true;
    this.feedbackMessage = 'Loading dispatch board...';

    this.ordersService.getOrders()
      .pipe(finalize(() => { this.isLoading = false; }))
      .subscribe({
        next: (remoteOrders: BackendOrder[]) => {
          this.applyDispatchState(remoteOrders.map(o => this.mapBackendOrder(o)));
        },
        error: () => { this.feedbackMessage = 'Failed to load orders.'; }
      });
  }

  private applyDispatchState(allOrders: DispatchOrder[]): void {
    this.allOrders = allOrders;

    // Left panel — assigned drivers
    const groupedDrivers = new Map<string, DispatchDriverGroup>();
    for (const order of allOrders) {
      if (!order.assignedDriverId) continue;
      const driverId = order.assignedDriverId;
      if (!groupedDrivers.has(driverId)) {
        groupedDrivers.set(driverId, {
          id: driverId,
          name: order.assignedDriverName || 'Assigned Driver',
          status: 'Assigned',
          orders: []
        });
      }
      groupedDrivers.get(driverId)!.orders.push({
        id: order.id,
        label: order.orderNumber,
        pickup: order.pickup.name,
        dropoff: order.delivery.name,
        time: `${this.formatTime(order.pickup.time)} → ${this.formatTime(order.delivery.time)}`
      });
    }
    this.assignedDrivers = Array.from(groupedDrivers.values());

    // Right panel — today's orders (admin view)
    const today = new Date().toISOString().split('T')[0];
    this.newOrders = allOrders
      .filter(o => o.pickup.date === today)
      .map(o => ({
        id: o.orderNumber,
        realId: o.id,
        pickup: o.pickup.name,
        dropoff: o.delivery.name,
        eta: this.estimateEta(o.delivery.date, o.delivery.time),
        total: this.money(o.total)
      }));

    this.selectedOrder =
      allOrders.find(order => order.id === this.selectedOrder?.id) ??
      allOrders[0] ??
      null;
    this.feedbackMessage = allOrders.length === 0 ? 'No orders available.' : '';
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private mapBackendOrder(order: BackendOrder): DispatchOrder {
    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      pickup: {
        name: order.pickup_name,
        phone: order.pickup_phone,
        address: order.pickup_address,
        time: order.pickup_time,
        date: order.pickup_date
      },
      delivery: {
        name: order.delivery_name,
        phone: order.delivery_phone,
        address: order.delivery_address,
        date: order.delivery_date,
        time: order.delivery_time
      },
      items: (order.items || []).map(i => ({
        name: i.itemName,
        price: this.toNumber(i.itemPrice),
        qty: Math.round(this.toNumber(i.itemQty))
      })),
      taxRate: order.tax_rate,
      deliveryFee: order.delivery_fees,
      tip: order.delivery_tips,
      discount: order.discount,
      total: order.total,
      payment: this.formatPaymentMethod(order.payment_method),
      instructions: order.instructions || '',
      proofOfDelivery: {
        signature: order.proof_of_delivery?.signature ?? false,
        picture: order.proof_of_delivery?.picture ?? false
      },
      assignedDriverId: order.driver?.id ?? null,
      assignedDriverName: order.driver?.name ?? ''
    };
  }

  private formatPaymentMethod(method: string | undefined): string {
    return method === 'credit_card' ? 'Credit Card' : 'Cash on Delivery';
  }

  private estimateEta(date: string, time: string): string {
    const deliveryAt = this.parseDateTime(date, time);
    if (!deliveryAt) return 'TBD';
    const diff = Math.round((deliveryAt.getTime() - Date.now()) / 60000);
    return diff <= 0 ? 'Due now' : `${diff} mins`;
  }

  private parseDateTime(date: string, time: string): Date | null {
    if (!date || !time) return null;
    const parsed = new Date(`${date}T${time}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatTime(time: string): string {
    if (!time) return 'TBD';
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return time;
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  money(amount: number): string { return `C$ ${amount.toFixed(2)}`; }

  driverEarningsLabel(total: unknown): string {
    return this.money(Math.round(this.toNumber(total) * 0.05 * 100) / 100);
  }

  private toNumber(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  }
}
