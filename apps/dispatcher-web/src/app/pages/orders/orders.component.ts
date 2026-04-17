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
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { OrderView } from '../../models/orders/order-tabs.model';
import { ToggleButtonComponent } from '../../components/toggle-button/toggle-button.component';

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
    NewOrderFormComponent,
    ToggleButtonComponent
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
  readyForPickupMap: Map<string, boolean> = new Map();

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
  // COLUMNS (UNIFIED)
  // -------------------------
  unifiedColumns: TableColumn[] = [
    { key: 'orderNo', label: 'Order Number', sortable: true },
    { key: 'customerName', label: 'Customer Name', sortable: true },
    { key: 'vendorName', label: 'Vendor Name', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'orderPlacedTime', label: 'Order Placed Time', sortable: true },
    { key: 'pickupTime', label: 'Pickup Time', sortable: true },
    { key: 'estDeliveryTime', label: 'Est. Delivery Time', sortable: true },
    { key: 'readyForPickup', label: 'Ready for Pickup', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'orderStatus', label: 'Order Status', sortable: true },
    { key: 'trackingStatus', label: 'Tracking Status', sortable: true },
    { key: 'actions', label: '', sortable: false }
  ];

  // -------------------------
  // MENU
  // -------------------------
  toggleMenu(row: any): void {
    this.activeMenuRow = this.activeMenuRow?.id === row.id ? null : row;
  }

  handleMenuAction(event: any, row: any): void {
    if (event.action === 'moveToCurrent') {
      const order = this.findOrderByOrderNo(row.orderNo);
      if (order) {
        this.updateOrderTab(order.id, 'current');
      }
    }

    if (event.action === 'edit') {
      const order = this.findOrderByOrderNo(row.orderNo);
      if (order) this.editOrder(order);
    }

    if (event.action === 'details') {
      const order = this.findOrderByOrderNo(row.orderNo);
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
    return this.orders.find(o => o.view.current.orderNo === orderNo);
  }

  async handleDetailsMenu(action: string): Promise<void> {
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
      await this.downloadOrderPdf(this.selectedOrderForDetails);
    }
  }

  updateReadyForPickup(isReady: boolean): void {
    if (!this.selectedOrderForDetails) return;

    const id = this.selectedOrderForDetails.id;

    // Update the map
    this.readyForPickupMap.set(id, isReady);

    // Update the view object
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return;

    this.orders[index].view.current.readyForPickup = isReady;
    this.orders[index].view.scheduled.readyForPickup = isReady;
    this.orders[index].view.completed.readyForPickup = isReady;
    this.orders[index].view.incomplete.readyForPickup = isReady;
    this.orders[index].view.history.readyForPickup = isReady;

    // Update the selected order for details
    this.selectedOrderForDetails = structuredClone(this.orders[index]);
  }

  updateReadyForPickupFromRow(orderId: string, isReady: boolean): void {
    this.readyForPickupMap.set(orderId, isReady);

    const index = this.orders.findIndex(o => o.id === orderId);
    if (index === -1) return;

    this.orders[index].view.current.readyForPickup = isReady;
    this.orders[index].view.scheduled.readyForPickup = isReady;
    this.orders[index].view.completed.readyForPickup = isReady;
    this.orders[index].view.incomplete.readyForPickup = isReady;
    this.orders[index].view.history.readyForPickup = isReady;
  }

  getReadyForPickupStatus(orderId: string): boolean {
    return this.readyForPickupMap.get(orderId) || false;
  }

  // -------------------------
  // PDF DOWNLOAD
  // -------------------------
  async downloadOrderPdf(order: OrderEntity): Promise<void> {
    const printContent = this.generatePrintHTML(order);

    const element = document.createElement('div');
    element.innerHTML = printContent;
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    element.style.width = '210mm';
    element.style.height = 'auto';
    element.style.padding = '0';
    element.style.margin = '0';
    document.body.appendChild(element);

    try {
      // Wait for images and fonts to load
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // Handle multi-page PDFs
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);

      while (heightLeft >= pageHeight) {
        position = heightLeft - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`order-${order.full.orderNumber}.pdf`);
    } finally {
      document.body.removeChild(element);
    }
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

    // -------------------- UNIFIED VIEW --------------------
    const view: OrderView = {
      orderNo: v.orderNumber,
      customerName: v.delivery.name,
      vendorName: v.pickup.name,
      amount: `C$ ${v.details.total}`,
      distance: '—',
      orderPlacedTime: this.formatDateTime(v.delivery.deliveryDate, v.pickup.pickupTime),
      pickupTime: this.formatTime(v.pickup.pickupTime),
      estDeliveryTime: this.formatDateTime(v.delivery.deliveryDate, v.delivery.deliveryTime),
      readyForPickup: false,
      driver: '',
      orderStatus: this.getStatus(''),
      trackingStatus: 'Inactive'
    };

    const tab: OrderTab =
      isToday && diff < 3 ? 'current' : 'scheduled';

    const id = this.editingOrderId ?? crypto.randomUUID();

    const entity: OrderEntity = {
      id,
      full: structuredClone(v),
      tab,
      view: {
        current: structuredClone(view),
        scheduled: structuredClone(view),
        completed: structuredClone(view),
        incomplete: structuredClone(view),
        history: structuredClone(view)
      }
    };

    // Initialize ready for pickup state for this order
    this.readyForPickupMap.set(id, true);

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
      .map(o => ({ ...o.view.current, id: o.id }));
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

    // Add Redrop option for Incomplete and Completed tabs
    if (this.activeTab === 'Incomplete' || this.activeTab === 'Completed') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Redrop', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' }
      ];
    }

    return baseItems;
  }

  // -------------------------
  // COLUMNS GETTER
  // -------------------------
  get columns(): TableColumn[] {
    const showPickupAndDriver = this.activeTab === 'Current' || this.activeTab === 'Scheduled';

    if (showPickupAndDriver) {
      return this.unifiedColumns;
    }

    return this.unifiedColumns.filter(
      c => c.key !== 'readyForPickup' && c.key !== 'driver'
    );
  }

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

    if (p && d && d <= p) return true;

    // Validate at least 1 valid item exists
    const items = v.details.items || [];
    const hasValidItem = items.some(item => {
      const nameFilled = !!item.itemName?.trim();
      const price = this.toNumber(item.itemPrice);
      const qty = this.toNumber(item.itemQty);
      return nameFilled && price > 0 && qty > 0;
    });

    return !hasValidItem;
  }

  private toNumber(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
    return Number.isFinite(n) ? n : 0;
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
        items: [{ itemName: '', itemPrice: '', itemQty: '' }],
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