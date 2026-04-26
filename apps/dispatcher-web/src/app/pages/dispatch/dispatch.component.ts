import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';

import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';
import { OrdersService } from '../../services/orders/orders.service';
import { DemoDriversService } from '../../services/demo-drivers/demo-drivers.service';
import { PaymentMethodType } from '../../models/new-order-form/new-order-form.model';

type BackendOrderItem = {
  itemName: string;
  itemPrice: number;
  itemQty: number;
};

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
  payment_method: PaymentMethodType;
  status: 'current' | 'scheduled' | 'completed' | 'incomplete' | 'history';
  ready_for_pickup: boolean;
  order_placed_time?: string | null;
};

type DispatchOrder = {
  id: string;
  orderNumber: string;
  status: BackendOrder['status'];
  pickup: {
    name: string;
    phone: string;
    address: string;
    time: string;
    date: string;
  };
  delivery: {
    name: string;
    phone: string;
    address: string;
    date: string;
    time: string;
  };
  items: Array<{
    name: string;
    price: number;
    qty: number;
  }>;
  taxRate: number;
  deliveryFee: number;
  tip: number;
  discount: number;
  total: number;
  payment: string;
  instructions: string;
  assignedDriverId: string | null;
  assignedDriverName: string;
};

type DispatchDriverGroup = {
  id: string;
  name: string;
  status: string;
  orders: Array<{
    id: string;
    label: string;
    pickup: string;
    dropoff: string;
    time: string;
  }>;
};

const LOCAL_DEMO_ORDERS_STORAGE_KEY = 'dispatch:orders:local-demo';

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './dispatch.component.html'
})
export class DispatchComponent implements OnInit {
  assignedDrivers: DispatchDriverGroup[] = [];
  selectedOrder: DispatchOrder | null = null;
  allOrders: DispatchOrder[] = [];
  newOrders: Array<{
    id: string;
    pickup: string;
    dropoff: string;
    eta: string;
    total: string;
  }> = [];

  feedbackMessage = '';
  isLoading = false;
  readonly showLocalDemoTools = this.isLocalhost();

  constructor(
    private readonly ordersService: OrdersService,
    private readonly demoDriversService: DemoDriversService
  ) { }

  ngOnInit(): void {
    this.loadDispatchState();
  }

  refreshDispatchState(): void {
    if (this.isLoading) return;
    this.loadDispatchState();
  }

  resetLocalDemoCache(): void {
    if (!this.showLocalDemoTools || typeof localStorage === 'undefined' || this.isLoading) return;

    localStorage.removeItem(LOCAL_DEMO_ORDERS_STORAGE_KEY);
    this.demoDriversService.resetDemoState();
    this.demoDriversService.seedDrivers();
    this.feedbackMessage = 'Local demo cache reset. Reassign current orders from Orders if needed.';
    this.loadDispatchState();
  }

  selectOrder(orderId: string): void {
    this.selectedOrder = this.allOrders.find((order) => order.id === orderId) ?? null;
  }

  private loadDispatchState(): void {
    this.isLoading = true;
    this.feedbackMessage = 'Loading dispatch board...';

    this.ordersService.getOrders()
      .pipe(finalize(() => {
        this.isLoading = false;
      }))
      .subscribe({
        next: (remoteOrders: BackendOrder[]) => {
          const localOrders = this.readLocalDemoOrders();
          const mappedRemoteOrders = remoteOrders.map((order) => this.mapBackendOrder(order));
          const allOrders = mappedRemoteOrders.length > 0
            ? mappedRemoteOrders
            : localOrders;
          this.applyDispatchState(allOrders);
        },
        error: () => {
          const localOrders = this.readLocalDemoOrders();
          this.applyDispatchState(localOrders);
          if (localOrders.length === 0) {
            this.feedbackMessage = 'No live orders loaded. Seed demo orders from Orders to populate Dispatch.';
          }
        }
      });
  }

  private applyDispatchState(allOrders: DispatchOrder[]): void {
    const assignments = this.demoDriversService.assignments();
    const drivers = this.demoDriversService.listDrivers();

    const ordersWithAssignments = allOrders.map((order) => {
      const assignmentDriverId = assignments[order.id] ?? null;
      const assignedDriver = assignmentDriverId
        ? this.demoDriversService.findDriverById(assignmentDriverId)
        : null;
      const assignedDriverId = assignedDriver?.id ?? null;

      return {
        ...order,
        assignedDriverId,
        assignedDriverName: assignedDriver?.name ?? ''
      };
    });

    this.allOrders = ordersWithAssignments;

    this.assignedDrivers = drivers
      .map((driver) => ({
        id: driver.id,
        name: driver.name,
        status: driver.status,
        orders: ordersWithAssignments
          .filter((order) => order.assignedDriverId === driver.id)
          .map((order) => ({
            id: order.id,
            label: order.orderNumber,
            pickup: order.pickup.name,
            dropoff: order.delivery.name,
            time: `${this.formatTime(order.pickup.time)} → ${this.formatTime(order.delivery.time)}`
          }))
      }))
      .filter((driver) => driver.orders.length > 0);

    this.newOrders = ordersWithAssignments
      .filter((order) =>
        !order.assignedDriverId &&
        (order.status === 'current' || order.status === 'scheduled')
      )
      .map((order) => ({
        id: order.orderNumber,
        pickup: order.pickup.name,
        dropoff: order.delivery.name,
        eta: this.estimateEta(order.delivery.date, order.delivery.time),
        total: this.money(order.total)
      }));

    const allDriverOrders = ordersWithAssignments.filter((order) => !!order.assignedDriverId);
    this.selectedOrder =
      allDriverOrders[0] ??
      ordersWithAssignments.find((order) => order.status === 'current') ??
      ordersWithAssignments[0] ??
      null;

    if (ordersWithAssignments.length === 0) {
      this.feedbackMessage = 'No orders available. Seed demo orders from Orders to populate Dispatch.';
    } else if (this.assignedDrivers.length === 0) {
      this.feedbackMessage = 'No drivers are assigned yet. Use Orders → Assign Driver to populate the dispatch board.';
    } else {
      this.feedbackMessage = '';
    }
  }

  private readLocalDemoOrders(): DispatchOrder[] {
    if (typeof localStorage === 'undefined') return [];

    const raw = localStorage.getItem(LOCAL_DEMO_ORDERS_STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as any[];
      if (!Array.isArray(parsed)) return [];

      return parsed.map((order) => this.mapLocalDemoOrder(order));
    } catch {
      return [];
    }
  }

  private mapLocalDemoOrder(order: any): DispatchOrder {
    return {
      id: String(order.id),
      orderNumber: String(order.full?.orderNumber ?? order.id),
      status: order.tab ?? 'current',
      pickup: {
        name: String(order.full?.pickup?.name ?? ''),
        phone: `${order.full?.pickup?.phone?.countryCode ?? ''}${order.full?.pickup?.phone?.number ?? ''}`,
        address: String(order.full?.pickup?.address ?? ''),
        time: String(order.full?.pickup?.pickupTime ?? ''),
        date: String(order.full?.pickup?.pickupDate ?? '')
      },
      delivery: {
        name: String(order.full?.delivery?.name ?? ''),
        phone: `${order.full?.delivery?.phone?.countryCode ?? ''}${order.full?.delivery?.phone?.number ?? ''}`,
        address: String(order.full?.delivery?.address ?? ''),
        date: String(order.full?.delivery?.deliveryDate ?? ''),
        time: String(order.full?.delivery?.deliveryTime ?? '')
      },
      items: Array.isArray(order.full?.details?.items)
        ? order.full.details.items.map((item: any) => ({
          name: String(item.itemName ?? ''),
          price: this.toNumber(item.itemPrice),
          qty: Math.round(this.toNumber(item.itemQty))
        }))
        : [],
      taxRate: this.toNumber(order.full?.details?.taxRate),
      deliveryFee: this.toNumber(order.full?.details?.deliveryFees),
      tip: this.toNumber(order.full?.details?.deliveryTips),
      discount: this.toNumber(order.full?.details?.discount),
      total: this.toNumber(order.full?.details?.total),
      payment: this.formatPaymentMethod(order.full?.details?.payment?.method),
      instructions: String(order.full?.details?.instructions ?? ''),
      assignedDriverId: null,
      assignedDriverName: ''
    };
  }

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
      items: (order.items || []).map((item) => ({
        name: item.itemName,
        price: this.toNumber(item.itemPrice),
        qty: Math.round(this.toNumber(item.itemQty))
      })),
      taxRate: order.tax_rate,
      deliveryFee: order.delivery_fees,
      tip: order.delivery_tips,
      discount: order.discount,
      total: order.total,
      payment: this.formatPaymentMethod(order.payment_method),
      instructions: order.instructions || '',
      assignedDriverId: null,
      assignedDriverName: ''
    };
  }

  private formatPaymentMethod(method: string | undefined): string {
    return method === 'credit_card' ? 'Credit Card' : 'Cash on Delivery';
  }

  private estimateEta(date: string, time: string): string {
    const deliveryAt = this.parseDateTime(date, time);
    if (!deliveryAt) return 'TBD';

    const diffMinutes = Math.round((deliveryAt.getTime() - Date.now()) / (1000 * 60));
    if (diffMinutes <= 0) return 'Due now';
    return `${diffMinutes} mins`;
  }

  private parseDateTime(date: string, time: string): Date | null {
    if (!date || !time) return null;
    const parsed = new Date(`${date}T${time}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatTime(time: string): string {
    if (!time) return 'TBD';
    const [hours, minutes] = time.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  private money(amount: number): string {
    return `C$ ${amount.toFixed(2)}`;
  }

  private toNumber(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isLocalhost(): boolean {
    if (typeof window === 'undefined') return false;
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }
}
