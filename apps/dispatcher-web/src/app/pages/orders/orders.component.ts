import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';

import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { PopupComponent } from '../../components/popup/popup.component';
import { NewOrderFormComponent } from '../../components/new-order-form/new-order-form.component';

import { TableColumn } from '../../models/table.model';
import { OrderEntity, OrderTab } from '../../models/orders/order-entity.model';
import { Order } from '../../models/orders/current-orders.model';
import { ScheduledOrder } from '../../models/orders/scheduled-orders.model';
import { CompletedOrder } from '../../models/orders/completed-orders.model';
import { IncompleteOrder } from '../../models/orders/incomplete-orders.model';
import { HistoryOrder } from '../../models/orders/history-orders.model';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    TableComponent,
    SearchBarComponent,
    ButtonComponent,
    PopupComponent,
    NewOrderFormComponent
  ],
  templateUrl: './orders.component.html'
})
export class OrdersComponent {

  // -------------------------
  // TABS
  // -------------------------
  tabs = ['Current', 'Scheduled', 'Completed', 'Incomplete', 'History'];
  activeTab = 'Current';

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  // -------------------------
  // STATE
  // -------------------------
  formSubmitted = signal(false);

  orders: OrderEntity[] = [];
  editingOrderId: string | null = null;

  isNewOrderOpen = false;
  newOrderValue: NewOrderFormValue = this.createDefaultNewOrder();

  activeMenuRow: any = null;

  menuItems = [
    { label: 'Details', action: 'details', icon: 'ph ph-eye' },
    { label: 'Edit', action: 'edit', icon: 'ph ph-pencil-simple' },
    { label: 'Print Order', action: 'print', icon: 'ph ph-printer' }
  ];

  // -------------------------
  // MENU
  // -------------------------
  toggleMenu(row: any): void {
    this.activeMenuRow = this.activeMenuRow === row ? null : row;
  }

  handleMenuAction(event: any, row: any): void {
    if (event.action === 'edit') {
      const order = this.orders.find(o => {
        const v = o.view;
        return (
          v.current?.orderNo === row.orderNo ||
          v.scheduled?.orderNo === row.orderNo ||
          v.completed?.orderNo === row.orderNo ||
          v.incomplete?.orderNo === row.orderNo ||
          v.history?.orderNo === row.orderNo
        );
      });

      if (order) this.editOrder(order);
    }

    this.activeMenuRow = null;
  }

  // -------------------------
  // OPEN / CLOSE
  // -------------------------
  openNewOrder(): void {
    this.newOrderValue = this.createDefaultNewOrder();
    this.editingOrderId = null;
    this.formSubmitted.set(false);
    this.isNewOrderOpen = true;
  }

  closeNewOrder(): void {
    this.isNewOrderOpen = false;
  }

  // -------------------------
  // SAVE (CREATE + EDIT)
  // -------------------------
  saveNewOrder(): void {
    this.formSubmitted.set(true);

    if (this.checkFormErrors()) return;

    const v = this.newOrderValue;

    const isToday = this.isToday(v.delivery.deliveryDate);
    const diff = this.getTimeDiffHours(v.pickup.pickupTime, v.delivery.deliveryTime);

    const base = {
      orderNo: v.orderNumber,
      customer: v.delivery.name,
      pickup: v.pickup.name,
      amount: `C$ ${v.details.total}`,
      distance: '—',
      driver: '',
      status: this.getStatus('')
    };

    // ---------------- CURRENT ----------------
    const currentView: Order = {
      ...base,
      placed: this.formatDateTime(v.delivery.deliveryDate, v.pickup.pickupTime),
      reqPickup: this.formatTime(v.pickup.pickupTime),
      reqDelivery: this.formatTime(v.delivery.deliveryTime),
      ready: false,
      tracking: 'Inactive'
    };

    // ---------------- SCHEDULED ----------------
    const scheduledView: ScheduledOrder = {
      select: false,
      orderNo: base.orderNo,
      customerName: base.customer,
      pickup: base.pickup,
      amount: base.amount,
      distance: base.distance,
      placementTime: currentView.placed,
      estDeliveryTime: this.formatDateTime(v.delivery.deliveryDate, v.delivery.deliveryTime),
      elapsedTime: '—',
      driver: base.driver,
      status: base.status
    };

    // ---------------- COMPLETED ----------------
    const completedView: CompletedOrder = {
      select: false,
      date: v.delivery.deliveryDate,
      orderNo: base.orderNo,
      customerName: base.customer,
      pickup: base.pickup,
      amount: base.amount,
      distance: base.distance,
      placementTime: currentView.placed,
      startTime: '—',
      pickupTime: '—',
      reqDeliveryTime: this.formatTime(v.delivery.deliveryTime),
      deliveryTime: this.formatTime(v.delivery.deliveryTime),
      driver: base.driver,
      feedback: ''
    };

    // ---------------- INCOMPLETE ----------------
    const incompleteView: IncompleteOrder = {
      select: false,
      date: v.delivery.deliveryDate,
      orderNo: base.orderNo,
      customerName: base.customer,
      pickup: base.pickup,
      amount: base.amount,
      distance: base.distance,
      placementTime: currentView.placed,
      startTime: 'N/A',
      pickupTime: '',
      deliveryTime: '',
      driver: base.driver,
      status: base.status,
      actions: ''
    };

    // ---------------- HISTORY ----------------
    const historyView: HistoryOrder = {
      date: v.delivery.deliveryDate,
      orderNo: base.orderNo,
      customerName: base.customer,
      pickup: base.pickup,
      amount: base.amount,
      distance: base.distance,
      placementTime: currentView.placed,
      startTime: '',
      pickupTime: '',
      deliveryTime: '',
      driver: base.driver,
      status: base.status
    };

    const tab: OrderTab =
      isToday && diff < 3 ? 'current' : 'scheduled';

    const id = this.editingOrderId ?? crypto.randomUUID();

    const entity: OrderEntity = {
      id,
      full: structuredClone(v),
      tab,
      view: {
        current: currentView,
        scheduled: scheduledView,
        completed: completedView,
        incomplete: incompleteView,
        history: historyView
      }
    };

    if (this.editingOrderId) {
      const index = this.orders.findIndex(o => o.id === this.editingOrderId);
      this.orders[index] = entity;
      this.editingOrderId = null;
    } else {
      this.orders.unshift(entity);
    }

    this.closeNewOrder();
    this.formSubmitted.set(false);
  }

  // -------------------------
  // EDIT
  // -------------------------
  editOrder(order: OrderEntity): void {
    this.newOrderValue = structuredClone(order.full);
    this.editingOrderId = order.id;
    this.isNewOrderOpen = true;
  }

  // -------------------------
  // ROWS
  // -------------------------
  get rows(): any[] {
    const tabKey = this.getTabKey(this.activeTab);

    return this.orders
      .filter(o => o.tab === tabKey)
      .map(o => {
        switch (tabKey) {
          case 'scheduled': return o.view.scheduled;
          case 'completed': return o.view.completed;
          case 'incomplete': return o.view.incomplete;
          case 'history': return o.view.history;
          default: return o.view.current;
        }
      });
  }

  private getTabKey(tab: string): OrderTab {
    switch (tab) {
      case 'Scheduled': return 'scheduled';
      case 'Completed': return 'completed';
      case 'Incomplete': return 'incomplete';
      case 'History': return 'history';
      default: return 'current';
    }
  }

  // -------------------------
  // COLUMNS
  // -------------------------
  get columns(): TableColumn[] {
    switch (this.activeTab) {
      case 'Scheduled':
        return this.scheduledColumns;
      case 'Completed':
        return this.completedColumns;
      case 'Incomplete':
        return this.incompleteColumns;
      case 'History':
        return this.historyColumns;
      default:
        return this.currentColumns;
    }
  }

  currentColumns: TableColumn[] = [
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customer', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placed', label: 'Order placed', sortable: true },
    { key: 'reqPickup', label: 'Req. Pickup Time', sortable: true },
    { key: 'reqDelivery', label: 'Req. Delivery Time', sortable: true },
    { key: 'ready', label: 'Ready for pick-up', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'tracking', label: 'Tracking', sortable: true },
    { key: 'actions', label: '', sortable: false }
  ];

  scheduledColumns: TableColumn[] = [
    { key: 'select', label: '', sortable: false },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'Customer Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'estDeliveryTime', label: 'Est. Delivery Time', sortable: true },
    { key: 'elapsedTime', label: 'Elapsed Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: '', sortable: false }
  ];

  completedColumns: TableColumn[] = [
    { key: 'select', label: '', sortable: false },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'startTime', label: 'Start Time', sortable: true },
    { key: 'pickupTime', label: 'Pick up Time', sortable: true },
    { key: 'reqDeliveryTime', label: 'Req. Delivery Time', sortable: true },
    { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'feedback', label: 'Feedback', sortable: true }
  ];

  incompleteColumns: TableColumn[] = [
    { key: 'select', label: '', sortable: false },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'startTime', label: 'Start Time', sortable: true },
    { key: 'pickupTime', label: 'Pick up Time', sortable: true },
    { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: '', sortable: false }
  ];

  historyColumns: TableColumn[] = [
    { key: 'date', label: 'Date', sortable: true },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'startTime', label: 'Start Time', sortable: true },
    { key: 'pickupTime', label: 'Pick up Time', sortable: true },
    { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true }
  ];

  // -------------------------
  // UTILITIES
  // -------------------------
  private getStatus(driver?: string): 'Assigned' | 'Unassigned' {
    return driver?.trim() ? 'Assigned' : 'Unassigned';
  }

  private toMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  private isToday(date: string): boolean {
    return date === this.todayYYYYMMDD();
  }

  private getTimeDiffHours(p: string, d: string): number {
    return (this.toMinutes(d) - this.toMinutes(p)) / 60;
  }

  private formatTime(t: string): string {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'pm' : 'am';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${period}`;
  }

  private formatDateTime(dateStr: string, time: string): string {
    const date = new Date(dateStr);
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${this.formatTime(time)}`;
  }

  private checkFormErrors(): boolean {
    const v = this.newOrderValue;

    if (!v.orderNumber.trim()) return true;
    if (!v.pickup.name.trim()) return true;
    if (!v.delivery.name.trim()) return true;

    const p = v.pickup.pickupTime;
    const d = v.delivery.deliveryTime;

    return p && d ? d <= p : false;
  }

  private todayYYYYMMDD(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private createDefaultNewOrder(): NewOrderFormValue {
    return {
      orderNumber: '',
      pickup: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        address: '',
        pickupTime: ''
      },
      delivery: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        email: '',
        address: '',
        deliveryDate: this.todayYYYYMMDD(),
        deliveryTime: ''
      },
      details: {
        items: [{ itemName: '', itemPrice: 0, itemQty: 0 }],
        taxRate: 0,
        deliveryFees: 0,
        deliveryTips: 0,
        discount: 0,
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        instructions: '',
        payment: { method: 'cash_on_delivery' }
      }
    };
  }

  emptyTitle = 'No data available';
  emptySubtitle = '';
}