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

  isDetailsOpen = false;
  selectedOrderForDetails: OrderEntity | null = null;
  isDetailsMenuOpen = false;

  menuItems = [
    { label: 'Details', action: 'details', icon: 'ph ph-eye' },
    { label: 'Edit', action: 'edit', icon: 'ph ph-pencil-simple' },
    { label: 'Print Order', action: 'print', icon: 'ph ph-printer' }
  ];

  detailsMenuItems = [
    { label: 'Mark as Done', action: 'done', icon: 'ph ph-check' },
    { label: 'Download PDF', action: 'pdf', icon: 'ph ph-download' },
    { label: 'Mark as Failed', action: 'failed', icon: 'ph ph-x', danger: true },
    { label: 'Delete', action: 'delete', icon: 'ph ph-trash', danger: true }
  ];

  // -------------------------
  // MENU
  // -------------------------
  toggleMenu(row: any): void {
    this.activeMenuRow = this.activeMenuRow === row ? null : row;
  }

  handleMenuAction(event: any, row: any): void {
    if (event.action === 'moveToCurrent') {
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

      if (order) {
        this.updateOrderTab(order.id, 'current');
      }
    }

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

    if (event.action === 'details') {
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

      if (order) {
        this.selectedOrderForDetails = order;
        this.isDetailsOpen = true;
      }
    }

    if (event.action === 'print') {
      const order = this.findOrderByOrderNo(row.orderNo);
      if (order) {
        this.openPrintWindow(order);
      }
    }

    this.activeMenuRow = null;
  }

  private findOrderByOrderNo(orderNo: string): OrderEntity | undefined {
    return this.orders.find(o => {
      const v = o.view;
      return (
        v.current?.orderNo === orderNo ||
        v.scheduled?.orderNo === orderNo ||
        v.completed?.orderNo === orderNo ||
        v.incomplete?.orderNo === orderNo ||
        v.history?.orderNo === orderNo
      );
    });
  }

  handleDetailsMenu(action: string): void {
    if (!this.selectedOrderForDetails) return;

    const id = this.selectedOrderForDetails.id;

    if (action === 'done') {
      this.updateOrderTab(id, 'completed');
    }

    if (action === 'failed') {
      this.updateOrderTab(id, 'incomplete');
    }

    if (action === 'delete') {
      this.orders = this.orders.filter(o => o.id !== id);
      this.closeDetails();
    }

    if (action === 'pdf') {
      this.downloadOrderPdf(this.selectedOrderForDetails);
    }
  }

  // -------------------------
  // OPEN / CLOSE
  // -------------------------

  downloadOrderPdf(order: OrderEntity): void {
    const content = JSON.stringify(order.full, null, 2);

    const blob = new Blob([content], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `order-${order.full.orderNumber}.json`;
    a.click();

    window.URL.revokeObjectURL(url);
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

  closeDetails(): void {
    this.isDetailsOpen = false;
    this.selectedOrderForDetails = null;
  }

  maskCard(card: string = ''): string {
    if (!card) return '';
    return card.replace(/\d(?=\d{4})/g, '*');
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
      .filter(o => {
        if (tabKey === 'history') return true;
        return o.tab === tabKey;
      })
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

  // Get dynamic menu items based on active tab
  getContextMenuItems(): any[] {
    const baseItems = [
      { label: 'Details', action: 'details', icon: 'ph ph-eye' },
      { label: 'Edit', action: 'edit', icon: 'ph ph-pencil-simple' },
      { label: 'Print Order', action: 'print', icon: 'ph ph-printer' }
    ];

    if (this.activeTab === 'Scheduled') {
      baseItems.push({ label: 'Move to Current', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' });
    }

    // Add Redrop option for Incomplete and Incomplete tabs
    if (this.activeTab === 'Incomplete' || this.activeTab === 'Completed') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Redrop', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' }
      ];
    }

    return baseItems;
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
    { key: 'feedback', label: 'Feedback', sortable: true },
    { key: 'actions', label: '', sortable: false }
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
    { key: 'actions', label: '', sortable: false },
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
    { key: 'status', label: 'Status', sortable: true },
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

  private updateOrderTab(id: string, tab: OrderTab): void {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return;

    this.orders[index].tab = tab;
    this.closeDetails();
  }

  private openPrintWindow(order: OrderEntity): void {
    const printContent = this.generatePrintHTML(order);
    const printWindow = window.open('', '', 'height=600,width=800');

    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  }

  private generatePrintHTML(order: OrderEntity): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order #${order.full.orderNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h2 { text-align: center; margin-bottom: 30px; }
        .section { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
        .section h3 { font-weight: bold; margin-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin: 5px 0; }
        .total { font-weight: bold; font-size: 16px; margin-top: 20px; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <h2>Order #${order.full.orderNumber}</h2>
      
      <div class="section">
        <h3>Pickup Information</h3>
        <p><strong>${order.full.pickup.name}</strong></p>
        <p>${order.full.pickup.phone.countryCode} ${order.full.pickup.phone.number}</p>
        <p>${order.full.pickup.address}</p>
        <p>Time: ${order.full.pickup.pickupTime}</p>
      </div>
      
      <div class="section">
        <h3>Delivery Information</h3>
        <p><strong>${order.full.delivery.name}</strong></p>
        <p>${order.full.delivery.phone.countryCode} ${order.full.delivery.phone.number}</p>
        <p>${order.full.delivery.email}</p>
        <p>${order.full.delivery.address}</p>
        <p>${order.full.delivery.deliveryDate} • ${order.full.delivery.deliveryTime}</p>
      </div>
      
      <div class="section">
        <h3>Items</h3>
        ${order.full.details.items.map(item => `
          <div class="row">
            <span>${item.itemName} × ${item.itemQty}</span>
            <span>C$ ${item.itemPrice}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="section">
        <div class="row">
          <span>Subtotal</span>
          <span>C$ ${order.full.details.subtotal}</span>
        </div>
        <div class="row">
          <span>Tax (${order.full.details.taxRate}%)</span>
          <span>C$ ${order.full.details.taxAmount}</span>
        </div>
        <div class="row">
          <span>Delivery Fees</span>
          <span>C$ ${order.full.details.deliveryFees}</span>
        </div>
        <div class="row">
          <span>Tips</span>
          <span>C$ ${order.full.details.deliveryTips}</span>
        </div>
        <div class="row">
          <span>Discount</span>
          <span>C$ ${order.full.details.discount}</span>
        </div>
      </div>
      
      <div class="total">
        <div class="row">
          <span>Total</span>
          <span>C$ ${order.full.details.total}</span>
        </div>
      </div>
    </body>
    </html>
  `;
  }

  emptyTitle = 'No data available';
  emptySubtitle = '';
}