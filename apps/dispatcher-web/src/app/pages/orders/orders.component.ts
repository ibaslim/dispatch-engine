import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { PopupComponent } from '../../components/popup/popup.component';
import { NewOrderFormComponent } from '../../components/new-order-form/new-order-form.component';
import { ToggleButtonComponent } from '../../components/toggle-button/toggle-button.component';
import { TableColumn } from '../../models/table.model';
import { NewOrderFormValue, PaymentMethodType } from '../../models/new-order-form/new-order-form.model';
import { DriverEntity } from '../../models/drivers/driver.model';
import { OrderEntity, OrderTab } from '../../models/orders/order-entity.model';
import { OrderView } from '../../models/orders/order-tabs.model';
import { DemoDriversService } from '../../services/demo-drivers/demo-drivers.service';
import { OrdersService } from '../../services/orders/orders.service';

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
  payment_details?: Record<string, unknown> | null;
  status: OrderTab;
  ready_for_pickup: boolean;
  order_placed_time?: string | null;
};

type DemoSeedTarget = {
  desiredStatus: OrderTab;
  readyForPickup: boolean;
  value: NewOrderFormValue;
};

const LOCAL_DEMO_ORDERS_STORAGE_KEY = 'dispatch:orders:local-demo';

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
export class OrdersComponent implements OnInit, OnDestroy {
  tabs = ['Current', 'Scheduled', 'Completed', 'Incomplete', 'History'];
  activeTab = 'Current';

  formSubmitted = signal(false);

  orders: OrderEntity[] = [];
  editingOrderId: string | null = null;
  readyForPickupMap = new Map<string, boolean>();

  isNewOrderOpen = false;
  isSavingOrder = false;
  isSeedingDemoOrders = false;
  newOrderValue: NewOrderFormValue = this.createDefaultNewOrder();

  activeMenuRow: { id: string } | null = null;

  isDetailsOpen = false;
  selectedOrderForDetails: OrderEntity | null = null;
  isDetailsMenuOpen = false;
  isAssignDriverOpen = false;
  selectedOrderForAssignment: OrderEntity | null = null;
  assignDriverQuery = '';
  selectedDriverId = '';

  searchQuery = '';

  feedbackMessage = '';
  feedbackTone: 'success' | 'error' | 'info' = 'info';

  showLocalDemoButton = this.isLocalhost();

  private scheduledRefreshHandle: ReturnType<typeof setInterval> | null = null;
  private scheduledPromotionInFlight = false;
  private localDemoOrders: OrderEntity[] = [];
  private localOnlyOrderIds = new Set<string>();

  detailsMenuItems = [
    { label: 'Mark as Done', action: 'done', icon: 'ph ph-check' },
    { label: 'Move to History', action: 'history', icon: 'ph ph-archive-box' },
    { label: 'Download PDF', action: 'pdf', icon: 'ph ph-download' },
    { label: 'Mark as Failed', action: 'failed', icon: 'ph ph-x', danger: true },
    { label: 'Delete', action: 'delete', icon: 'ph ph-trash', danger: true }
  ];

  constructor(
    private readonly ordersService: OrdersService,
    private readonly demoDriversService: DemoDriversService
  ) { }

  ngOnInit(): void {
    if (this.showLocalDemoButton && this.demoDriversService.listDrivers().length === 0) {
      this.demoDriversService.seedDrivers();
    }
    this.restoreLocalDemoOrders();
    this.loadOrders();
    this.scheduledRefreshHandle = setInterval(() => {
      void this.checkAndUpdateScheduledOrders();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.scheduledRefreshHandle) {
      clearInterval(this.scheduledRefreshHandle);
    }
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  loadOrders(): void {
    this.ordersService.getOrders().subscribe({
      next: (res: BackendOrder[]) => {
        const remoteOrders = res.map((order) => this.mapBackendOrder(order));
        this.refreshOrdersState(remoteOrders);

        if (this.selectedOrderForDetails) {
          this.selectedOrderForDetails =
            this.orders.find((order) => order.id === this.selectedOrderForDetails?.id) ?? null;
          this.isDetailsOpen = this.selectedOrderForDetails !== null;
        }
      },
      error: () => {
        this.setFeedback('Unable to load orders.', 'error');
      }
    });
  }

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

  toggleMenu(row: { id: string }): void {
    this.activeMenuRow = this.activeMenuRow?.id === row.id ? null : row;
  }

  handleMenuAction(event: { action: string }, row: { orderNo: string }): void {
    const order = this.findOrderByOrderNo(row.orderNo);
    if (!order) return;

    switch (event.action) {
      case 'moveToCurrent':
        if (this.isLocalOnlyOrder(order.id)) {
          this.updateLocalOrderStatus(order.id, 'current');
          this.setFeedback(`Order ${order.full.orderNumber} moved to Current.`, 'success');
          break;
        }
        this.ordersService.updateStatus(order.id, 'current').subscribe({
          next: () => {
            this.setFeedback(`Order ${order.full.orderNumber} moved to Current.`, 'success');
            this.loadOrders();
          },
          error: () => this.setFeedback('Unable to update order status.', 'error')
        });
        break;
      case 'moveToHistory':
        if (this.isLocalOnlyOrder(order.id)) {
          this.updateLocalOrderStatus(order.id, 'history');
          this.setFeedback(`Order ${order.full.orderNumber} moved to History.`, 'success');
          break;
        }
        this.ordersService.updateStatus(order.id, 'history').subscribe({
          next: () => {
            this.setFeedback(`Order ${order.full.orderNumber} moved to History.`, 'success');
            this.loadOrders();
          },
          error: () => this.setFeedback('Unable to update order status.', 'error')
        });
        break;
      case 'assignDriver':
        this.openAssignDriver(order);
        break;
      case 'edit':
        this.editOrder(order);
        break;
      case 'details':
        this.selectedOrderForDetails = structuredClone(order);
        this.isDetailsOpen = true;
        break;
      case 'print':
        this.openPrintWindow(order);
        break;
      case 'delete':
        if (this.isLocalOnlyOrder(order.id)) {
          this.deleteLocalOrder(order.id);
          this.setFeedback(`Order ${order.full.orderNumber} deleted.`, 'success');
          break;
        }
        this.ordersService.deleteOrder(order.id).subscribe({
          next: () => {
            this.setFeedback(`Order ${order.full.orderNumber} deleted.`, 'success');
            this.loadOrders();
          },
          error: () => this.setFeedback('Unable to delete order.', 'error')
        });
        break;
    }

    this.activeMenuRow = null;
  }

  private findOrderByOrderNo(orderNo: string): OrderEntity | undefined {
    return this.orders.find((order) => order.view.current.orderNo === orderNo);
  }

  async handleDetailsMenu(action: string): Promise<void> {
    if (!this.selectedOrderForDetails) return;

    const selectedOrder = this.selectedOrderForDetails;
    const id = selectedOrder.id;

    if (action === 'pdf') {
      await this.downloadOrderPdf(selectedOrder);
      return;
    }

    if (action === 'done' || action === 'failed' || action === 'history') {
      const nextStatus: OrderTab =
        action === 'done' ? 'completed' :
          action === 'failed' ? 'incomplete' :
            'history';

      if (this.isLocalOnlyOrder(id)) {
        this.updateLocalOrderStatus(id, nextStatus);
        this.setFeedback(`Order ${selectedOrder.full.orderNumber} updated to ${this.formatStatusLabel(nextStatus)}.`, 'success');
        this.closeDetails();
        return;
      }

      this.ordersService.updateStatus(id, nextStatus).subscribe({
        next: () => {
          this.setFeedback(`Order ${selectedOrder.full.orderNumber} updated to ${this.formatStatusLabel(nextStatus)}.`, 'success');
          this.closeDetails();
          this.loadOrders();
        },
        error: () => this.setFeedback('Unable to update order status.', 'error')
      });
      return;
    }

    if (action === 'delete') {
      if (this.isLocalOnlyOrder(id)) {
        this.deleteLocalOrder(id);
        this.setFeedback(`Order ${selectedOrder.full.orderNumber} deleted.`, 'success');
        this.closeDetails();
        return;
      }

      this.ordersService.deleteOrder(id).subscribe({
        next: () => {
          this.setFeedback(`Order ${selectedOrder.full.orderNumber} deleted.`, 'success');
          this.closeDetails();
          this.loadOrders();
        },
        error: () => this.setFeedback('Unable to delete order.', 'error')
      });
    }
  }

  updateReadyForPickup(isReady: boolean): void {
    if (!this.selectedOrderForDetails) return;

    const id = this.selectedOrderForDetails.id;
    this.setReadyForPickupLocal(id, isReady);

    if (this.isLocalOnlyOrder(id)) {
      this.setFeedback(`Order ${this.selectedOrderForDetails.full.orderNumber} ready-for-pickup updated locally.`, 'success');
      return;
    }

    this.ordersService.toggleReady(id, isReady).subscribe({
      next: () => {
        this.readyForPickupMap.set(id, isReady);
      },
      error: () => {
        this.setFeedback('Unable to update ready-for-pickup state.', 'error');
        this.loadOrders();
      }
    });
  }

  updateReadyForPickupFromRow(orderId: string, isReady: boolean): void {
    this.setReadyForPickupLocal(orderId, isReady);

    if (this.isLocalOnlyOrder(orderId)) {
      return;
    }

    this.ordersService.toggleReady(orderId, isReady).subscribe({
      next: () => {
        this.readyForPickupMap.set(orderId, isReady);
      },
      error: () => {
        this.setFeedback('Unable to update ready-for-pickup state.', 'error');
        this.loadOrders();
      }
    });
  }

  getReadyForPickupStatus(orderId: string): boolean {
    if (this.readyForPickupMap.has(orderId)) {
      return this.readyForPickupMap.get(orderId) ?? false;
    }

    return !!this.orders.find((order) => order.id === orderId)?.view.current.readyForPickup;
  }

  async checkAndUpdateScheduledOrders(): Promise<void> {
    if (this.scheduledPromotionInFlight) return;

    const now = new Date();
    const threshold = now.getTime() + (3 * 60 * 60 * 1000);
    const candidateIds = this.orders
      .filter((order) => order.tab === 'scheduled')
      .filter((order) => {
        const deliveryDateTime = this.parseDateTime(
          order.full.delivery.deliveryDate,
          order.full.delivery.deliveryTime
        );

        return deliveryDateTime !== null && deliveryDateTime.getTime() <= threshold;
      })
      .map((order) => order.id);

    if (candidateIds.length === 0) return;

    const localCandidateIds = candidateIds.filter((id) => this.isLocalOnlyOrder(id));
    for (const id of localCandidateIds) {
      this.updateLocalOrderStatus(id, 'current');
    }

    const remoteCandidateIds = candidateIds.filter((id) => !this.isLocalOnlyOrder(id));
    if (remoteCandidateIds.length === 0) return;

    this.scheduledPromotionInFlight = true;

    try {
      await Promise.all(remoteCandidateIds.map((id) =>
        firstValueFrom(this.ordersService.updateStatus(id, 'current'))
      ));
      this.loadOrders();
    } catch {
      this.setFeedback('Unable to refresh scheduled orders automatically.', 'error');
    } finally {
      this.scheduledPromotionInFlight = false;
    }
  }

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
      await new Promise((resolve) => setTimeout(resolve, 500));

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

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

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

  openNewOrder(): void {
    this.newOrderValue = this.createDefaultNewOrder();
    this.editingOrderId = null;
    this.formSubmitted.set(false);
    this.isNewOrderOpen = true;
  }

  closeNewOrder(): void {
    this.isNewOrderOpen = false;
    this.isSavingOrder = false;
  }

  closeDetails(): void {
    this.isDetailsOpen = false;
    this.selectedOrderForDetails = null;
    this.isDetailsMenuOpen = false;
  }

  maskCard(card: string = ''): string {
    if (!card) return '';
    return card.replace(/\d(?=\d{4})/g, '*');
  }

  async saveNewOrder(): Promise<void> {
    this.formSubmitted.set(true);

    if (this.checkFormErrors() || this.isSavingOrder) return;

    this.isSavingOrder = true;

    const payload = this.toOrderPayload(this.newOrderValue);
    const mode = this.editingOrderId ? 'updated' : 'created';
    const orderNumber = this.newOrderValue.orderNumber;

    try {
      if (this.editingOrderId && this.isLocalOnlyOrder(this.editingOrderId)) {
        this.updateLocalOrderFromForm(this.editingOrderId, this.newOrderValue);
        this.setFeedback(`Order ${orderNumber} updated locally for demo.`, 'success');
        this.closeNewOrder();
        this.formSubmitted.set(false);
        this.editingOrderId = null;
        return;
      }

      if (this.editingOrderId) {
        await firstValueFrom(this.ordersService.updateOrder(this.editingOrderId, payload));
      } else {
        await firstValueFrom(this.ordersService.createOrder(payload));
      }

      this.setFeedback(`Order ${orderNumber} ${mode}.`, 'success');
      this.loadOrders();
      this.closeNewOrder();
      this.formSubmitted.set(false);
      this.editingOrderId = null;
    } catch (error: any) {
      if (!this.editingOrderId && this.showLocalDemoButton) {
        const localOrder = this.buildLocalOrderEntity(
          this.newOrderValue,
          this.deriveStatusFromForm(this.newOrderValue),
          false,
          this.currentOrderPlacedTime()
        );
        this.addLocalDemoOrder(localOrder);
        this.setFeedback(`Order ${orderNumber} saved locally for demo.`, 'success');
        this.closeNewOrder();
        this.formSubmitted.set(false);
        return;
      }

      this.setFeedback(error?.error?.detail || `Failed to save order ${orderNumber}.`, 'error');
    } finally {
      this.isSavingOrder = false;
    }
  }

  editOrder(order: OrderEntity): void {
    this.newOrderValue = structuredClone(order.full);
    this.editingOrderId = order.id;
    this.formSubmitted.set(false);
    this.isNewOrderOpen = true;
  }

  openAssignDriver(row: { id: string } | OrderEntity): void {
    const orderId = row.id;
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return;

    this.selectedOrderForAssignment = structuredClone(order);
    this.assignDriverQuery = '';
    this.selectedDriverId = this.demoDriversService.getAssignedDriver(order.id)?.id ?? '';
    this.isAssignDriverOpen = true;
  }

  closeAssignDriver(): void {
    this.isAssignDriverOpen = false;
    this.selectedOrderForAssignment = null;
    this.assignDriverQuery = '';
    this.selectedDriverId = '';
  }

  assignSelectedDriver(): void {
    if (!this.selectedOrderForAssignment || !this.selectedDriverId) {
      this.setFeedback('Select a driver to assign.', 'error');
      return;
    }

    this.demoDriversService.assignDriver(
      this.selectedOrderForAssignment.id,
      this.selectedDriverId
    );
    this.refreshOrdersState(this.getRemoteOrders());
    this.setFeedback(`Driver assigned to order ${this.selectedOrderForAssignment.full.orderNumber}.`, 'success');
    this.closeAssignDriver();
  }

  unassignSelectedDriver(): void {
    if (!this.selectedOrderForAssignment) return;

    this.demoDriversService.unassignDriver(this.selectedOrderForAssignment.id);
    this.refreshOrdersState(this.getRemoteOrders());
    this.setFeedback(`Driver removed from order ${this.selectedOrderForAssignment.full.orderNumber}.`, 'success');
    this.closeAssignDriver();
  }

  get assignableDrivers(): DriverEntity[] {
    const query = this.assignDriverQuery.trim().toLowerCase();
    const drivers = this.demoDriversService.listDrivers();

    if (!query) return drivers;

    return drivers.filter((driver) =>
      driver.name.toLowerCase().includes(query) ||
      driver.email.toLowerCase().includes(query) ||
      `${driver.phoneCountryCode}${driver.phoneNumber}`.toLowerCase().includes(query) ||
      driver.vehicle.toLowerCase().includes(query)
    );
  }

  get rows(): Array<Record<string, unknown>> {
    const tabKey = this.getTabKey(this.activeTab);
    const q = this.searchQuery.trim().toLowerCase();

    return this.orders
      .filter((order) => order.tab === tabKey)
      .filter((order) => {
        if (!q) return true;
        const view = order.view.current;
        return (
          view.orderNo.toLowerCase().includes(q) ||
          view.customerName.toLowerCase().includes(q) ||
          view.vendorName.toLowerCase().includes(q)
        );
      })
      .map((order) => ({
        ...order.view.current,
        id: order.id
      }));
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

  getContextMenuItems(): Array<{ label: string; action: string; icon: string }> {
    if (this.activeTab === 'Completed' || this.activeTab === 'Incomplete') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Assign Driver', action: 'assignDriver', icon: 'ph ph-user-plus' },
        { label: 'Redrop', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' },
        { label: 'Move to History', action: 'moveToHistory', icon: 'ph ph-archive-box' },
        { label: 'Print Order', action: 'print', icon: 'ph ph-printer' }
      ];
    }

    const baseItems = [
      { label: 'Details', action: 'details', icon: 'ph ph-eye' },
      { label: 'Assign Driver', action: 'assignDriver', icon: 'ph ph-user-plus' },
      { label: 'Edit', action: 'edit', icon: 'ph ph-pencil-simple' },
      { label: 'Print Order', action: 'print', icon: 'ph ph-printer' }
    ];

    if (this.activeTab === 'Scheduled') {
      baseItems.push({ label: 'Move to Current', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' });
    }

    if (this.activeTab === 'History') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Print Order', action: 'print', icon: 'ph ph-printer' }
      ];
    }

    return baseItems;
  }

  get columns(): TableColumn[] {
    const showPickupAndDriver = this.activeTab === 'Current' || this.activeTab === 'Scheduled';

    if (showPickupAndDriver) {
      return this.unifiedColumns;
    }

    return this.unifiedColumns.filter((column) =>
      column.key !== 'readyForPickup' && column.key !== 'driver'
    );
  }

  onPickupPin(): void {
    this.openMapModule();
  }

  onDeliveryPin(): void {
    this.openMapModule();
  }

  formatPaymentMethod(method: PaymentMethodType): string {
    return method === 'credit_card' ? 'Credit card' : 'Cash on delivery';
  }

  async seedDemoOrders(): Promise<void> {
    if (!this.showLocalDemoButton || this.isSeedingDemoOrders) return;

    this.isSeedingDemoOrders = true;
    this.setFeedback('Seeding demo orders...', 'info');

    try {
      const demoOrders = this.buildDemoSeedTargets();
      const localOrders = demoOrders.map((target) =>
        this.buildLocalOrderEntity(
          target.value,
          target.desiredStatus,
          target.readyForPickup,
          this.currentOrderPlacedTime()
        )
      );
      this.localOnlyOrderIds = new Set(localOrders.map((order) => order.id));
      this.localDemoOrders = localOrders;
      this.refreshOrdersState(this.getRemoteOrders());

      this.setFeedback('Demo orders reset and created across Current, Scheduled, Completed, Incomplete, and History.', 'success');
    } catch {
      this.setFeedback('Unable to seed demo orders.', 'error');
    } finally {
      this.isSeedingDemoOrders = false;
    }
  }

  fillNewOrderWithDummyData(): void {
    this.newOrderValue = this.buildDemoDraftValue();
    this.formSubmitted.set(false);
    this.setFeedback('Demo data filled in the order form.', 'success');
  }

  emptyTitle = 'No data available';
  emptySubtitle = '';

  private mapBackendOrder(order: BackendOrder): OrderEntity {
    const pickupPhone = this.splitPhoneNumber(order.pickup_phone);
    const deliveryPhone = this.splitPhoneNumber(order.delivery_phone);
    const payment = this.mapPaymentDetails(order.payment_method, order.payment_details);

    const view: OrderView = {
      orderNo: order.order_number,
      customerName: order.delivery_name,
      vendorName: order.pickup_name,
      amount: this.money(order.total),
      distance: '—',
      orderPlacedTime: order.order_placed_time || '',
      pickupTime: this.formatTime(order.pickup_time),
      estDeliveryTime: this.formatDateTime(order.delivery_date, order.delivery_time),
      readyForPickup: order.ready_for_pickup ?? false,
      driver: '',
      orderStatus: this.formatStatusLabel(order.status),
      trackingStatus: 'Inactive'
    };

    return {
      id: order.id,
      full: {
        orderNumber: order.order_number,
        pickup: {
          name: order.pickup_name,
          phone: pickupPhone,
          address: order.pickup_address,
          pickupDate: order.pickup_date,
          pickupTime: order.pickup_time
        },
        delivery: {
          name: order.delivery_name,
          phone: deliveryPhone,
          email: order.delivery_email,
          address: order.delivery_address,
          deliveryDate: order.delivery_date,
          deliveryTime: order.delivery_time
        },
        details: {
          items: (order.items || []).map((item) => ({
            itemName: item.itemName,
            itemPrice: String(item.itemPrice),
            itemQty: String(item.itemQty)
          })),
          subtotal: order.subtotal,
          taxRate: order.tax_rate,
          taxAmount: order.tax_amount,
          deliveryFees: order.delivery_fees,
          deliveryTips: order.delivery_tips,
          discount: order.discount,
          total: order.total,
          instructions: order.instructions || '',
          payment
        }
      },
      tab: order.status,
      view: {
        current: { ...view },
        scheduled: { ...view },
        completed: { ...view },
        incomplete: { ...view },
        history: { ...view }
      }
    };
  }

  private refreshOrdersState(remoteOrders: OrderEntity[]): void {
    this.orders = [...remoteOrders, ...this.localDemoOrders].map((order) =>
      this.applyAssignedDriver(order)
    );
    this.readyForPickupMap.clear();

    for (const order of this.orders) {
      this.readyForPickupMap.set(order.id, !!order.view.current.readyForPickup);
    }

    this.persistLocalDemoOrders();
  }

  private getRemoteOrders(): OrderEntity[] {
    return this.orders.filter((order) => !this.localOnlyOrderIds.has(order.id));
  }

  private isLocalOnlyOrder(orderId: string): boolean {
    return this.localOnlyOrderIds.has(orderId);
  }

  private addLocalDemoOrder(order: OrderEntity): void {
    this.localOnlyOrderIds.add(order.id);
    this.localDemoOrders = [...this.localDemoOrders, order];
    this.refreshOrdersState(this.getRemoteOrders());
  }

  private deleteLocalOrder(orderId: string): void {
    this.localOnlyOrderIds.delete(orderId);
    this.localDemoOrders = this.localDemoOrders.filter((order) => order.id !== orderId);
    this.readyForPickupMap.delete(orderId);
    this.refreshOrdersState(this.getRemoteOrders());
  }

  private updateLocalOrderStatus(orderId: string, status: OrderTab): void {
    this.localDemoOrders = this.localDemoOrders.map((order) => {
      if (order.id !== orderId) return order;

      const nextOrder = structuredClone(order);
      nextOrder.tab = status;
      nextOrder.view.current.orderStatus = this.formatStatusLabel(status);
      nextOrder.view.scheduled.orderStatus = this.formatStatusLabel(status);
      nextOrder.view.completed.orderStatus = this.formatStatusLabel(status);
      nextOrder.view.incomplete.orderStatus = this.formatStatusLabel(status);
      nextOrder.view.history.orderStatus = this.formatStatusLabel(status);
      return nextOrder;
    });

    this.refreshOrdersState(this.getRemoteOrders());

    if (this.selectedOrderForDetails?.id === orderId) {
      this.selectedOrderForDetails = this.orders.find((order) => order.id === orderId) ?? null;
    }
  }

  private updateLocalOrderFromForm(orderId: string, value: NewOrderFormValue): void {
    const currentReady = this.getReadyForPickupStatus(orderId);

    this.localDemoOrders = this.localDemoOrders.map((order) =>
      order.id === orderId
        ? this.buildLocalOrderEntity(
          value,
          order.tab,
          currentReady,
          order.view.current.orderPlacedTime || this.currentOrderPlacedTime(),
          orderId
        )
        : order
    );

    this.refreshOrdersState(this.getRemoteOrders());
  }

  private buildLocalOrderEntity(
    value: NewOrderFormValue,
    tab: OrderTab,
    readyForPickup: boolean,
    orderPlacedTime: string,
    id?: string
  ): OrderEntity {
    const view: OrderView = {
      orderNo: value.orderNumber,
      customerName: value.delivery.name,
      vendorName: value.pickup.name,
      amount: this.money(value.details.total),
      distance: '—',
      orderPlacedTime,
      pickupTime: this.formatTime(value.pickup.pickupTime),
      estDeliveryTime: this.formatDateTime(value.delivery.deliveryDate, value.delivery.deliveryTime),
      readyForPickup,
      driver: '',
      orderStatus: this.formatStatusLabel(tab),
      trackingStatus: 'Inactive'
    };

    return {
      id: id ?? crypto.randomUUID(),
      tab,
      full: structuredClone(value),
      view: {
        current: { ...view },
        scheduled: { ...view },
        completed: { ...view },
        incomplete: { ...view },
        history: { ...view }
      }
    };
  }

  private applyAssignedDriver(order: OrderEntity): OrderEntity {
    const assignedDriver = this.demoDriversService.getAssignedDriver(order.id);
    const driverName = assignedDriver?.name ?? '';
    const nextOrder = structuredClone(order);

    nextOrder.view.current.driver = driverName;
    nextOrder.view.scheduled.driver = driverName;
    nextOrder.view.completed.driver = driverName;
    nextOrder.view.incomplete.driver = driverName;
    nextOrder.view.history.driver = driverName;

    return nextOrder;
  }

  private mapPaymentDetails(
    method: PaymentMethodType,
    paymentDetails?: Record<string, unknown> | null
  ): NewOrderFormValue['details']['payment'] {
    if (method !== 'credit_card') {
      return { method };
    }

    const details = paymentDetails ?? {};
    const creditCardSource = (
      typeof details['creditCard'] === 'object' && details['creditCard'] !== null
        ? details['creditCard'] as Record<string, unknown>
        : details
    );

    return {
      method,
      creditCard: {
        cardholderName: String(creditCardSource['cardholderName'] ?? ''),
        cardNumber: String(creditCardSource['cardNumber'] ?? ''),
        expiryMonth: String(creditCardSource['expiryMonth'] ?? ''),
        expiryYear: String(creditCardSource['expiryYear'] ?? ''),
        cvc: String(creditCardSource['cvc'] ?? '')
      }
    };
  }

  private splitPhoneNumber(phone: string): { countryCode: string; number: string } {
    const trimmed = String(phone || '').trim();
    const digits = trimmed.replace(/\D/g, '');

    if (trimmed.startsWith('+') && digits.length > 10) {
      return {
        countryCode: `+${digits.slice(0, digits.length - 10)}`,
        number: digits.slice(-10)
      };
    }

    if (digits.length > 10) {
      return {
        countryCode: `+${digits.slice(0, digits.length - 10)}`,
        number: digits.slice(-10)
      };
    }

    return {
      countryCode: '+1',
      number: digits
    };
  }

  private setReadyForPickupLocal(orderId: string, isReady: boolean): void {
    this.readyForPickupMap.set(orderId, isReady);

    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return;

    order.view.current.readyForPickup = isReady;
    order.view.scheduled.readyForPickup = isReady;
    order.view.completed.readyForPickup = isReady;
    order.view.incomplete.readyForPickup = isReady;
    order.view.history.readyForPickup = isReady;

    if (this.selectedOrderForDetails?.id === orderId) {
      this.selectedOrderForDetails = structuredClone(order);
    }
  }

  private toOrderPayload(value: NewOrderFormValue): Record<string, unknown> {
    return {
      order_number: value.orderNumber.trim(),
      pickup_name: value.pickup.name.trim(),
      pickup_phone: `${value.pickup.phone.countryCode}${value.pickup.phone.number}`,
      pickup_address: value.pickup.address.trim(),
      pickup_date: value.pickup.pickupDate,
      pickup_time: value.pickup.pickupTime,
      delivery_name: value.delivery.name.trim(),
      delivery_phone: `${value.delivery.phone.countryCode}${value.delivery.phone.number}`,
      delivery_email: value.delivery.email.trim(),
      delivery_address: value.delivery.address.trim(),
      delivery_date: value.delivery.deliveryDate,
      delivery_time: value.delivery.deliveryTime,
      items: value.details.items
        .filter((item) =>
          item.itemName.trim() &&
          this.toNumber(item.itemPrice) > 0 &&
          this.toNumber(item.itemQty) > 0
        )
        .map((item) => ({
          itemName: item.itemName.trim(),
          itemPrice: this.toNumber(item.itemPrice),
          itemQty: Math.round(this.toNumber(item.itemQty))
        })),
      subtotal: value.details.subtotal,
      tax_rate: value.details.taxRate,
      tax_amount: value.details.taxAmount,
      delivery_fees: value.details.deliveryFees,
      delivery_tips: value.details.deliveryTips,
      discount: value.details.discount,
      total: value.details.total,
      instructions: value.details.instructions.trim(),
      payment_method: value.details.payment.method,
      payment_details: value.details.payment.method === 'credit_card'
        ? { creditCard: value.details.payment.creditCard }
        : null
    };
  }

  private formatStatusLabel(status: OrderTab): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private currentOrderPlacedTime(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private formatTime(time: string): string {
    if (!time) return '';

    const [hours, minutes] = time.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;

    const period = hours >= 12 ? 'pm' : 'am';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${period}`;
  }

  private formatDateTime(dateStr: string, time: string): string {
    const parsed = this.parseDateTime(dateStr, time);
    if (!parsed) return this.formatTime(time);

    return `${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${this.formatTime(time)}`;
  }

  private parseDateTime(dateStr: string, time: string): Date | null {
    if (!dateStr || !time) return null;
    const value = new Date(`${dateStr}T${time}`);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  private checkFormErrors(): boolean {
    const value = this.newOrderValue;

    if (!value.orderNumber.trim()) return true;
    if (!value.pickup.name.trim()) return true;
    if (!value.pickup.address.trim()) return true;
    if (!value.pickup.pickupDate || !value.pickup.pickupTime) return true;
    if (!this.isValidPhone(value.pickup.phone.number)) return true;

    if (!value.delivery.name.trim()) return true;
    if (!value.delivery.email.trim() || !this.isValidEmail(value.delivery.email)) return true;
    if (!value.delivery.address.trim()) return true;
    if (!value.delivery.deliveryDate || !value.delivery.deliveryTime) return true;
    if (!this.isValidPhone(value.delivery.phone.number)) return true;

    if (this.isDeliveryBeforeOrEqualPickup(value)) return true;

    const items = value.details.items || [];
    const hasValidItem = items.some((item) =>
      item.itemName.trim() &&
      this.toNumber(item.itemPrice) > 0 &&
      this.toNumber(item.itemQty) > 0
    );
    if (!hasValidItem) return true;

    if (value.details.payment.method === 'credit_card') {
      const creditCard = value.details.payment.creditCard;
      if (!creditCard) return true;
      if (!/^[A-Za-z\s]+$/.test(creditCard.cardholderName.trim())) return true;
      if (!/^\d{16}$/.test(creditCard.cardNumber)) return true;
      if (!/^(0[1-9]|1[0-2])$/.test(creditCard.expiryMonth)) return true;
      if (!/^\d{4}$/.test(creditCard.expiryYear)) return true;
      if (!/^\d{3}$/.test(creditCard.cvc)) return true;
    }

    return false;
  }

  private isValidPhone(phoneNumber: string): boolean {
    return /^\d{10}$/.test(phoneNumber);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  private isDeliveryBeforeOrEqualPickup(value: NewOrderFormValue): boolean {
    if (value.pickup.pickupDate !== value.delivery.deliveryDate) return false;

    const pickupDateTime = this.parseDateTime(value.pickup.pickupDate, value.pickup.pickupTime);
    const deliveryDateTime = this.parseDateTime(value.delivery.deliveryDate, value.delivery.deliveryTime);

    if (!pickupDateTime || !deliveryDateTime) return false;

    return deliveryDateTime.getTime() <= pickupDateTime.getTime();
  }

  private toNumber(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private todayYYYYMMDD(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private createDefaultNewOrder(): NewOrderFormValue {
    return {
      orderNumber: '',
      pickup: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        address: '',
        pickupDate: this.todayYYYYMMDD(),
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

  private deriveStatusFromForm(value: NewOrderFormValue): OrderTab {
    const deliveryAt = this.parseDateTime(value.delivery.deliveryDate, value.delivery.deliveryTime);
    if (!deliveryAt) return 'current';

    return deliveryAt.getTime() <= Date.now() + (3 * 60 * 60 * 1000)
      ? 'current'
      : 'scheduled';
  }

  private generatePrintHTML(order: OrderEntity): string {
    const paymentMethod = this.formatPaymentMethod(order.full.details.payment.method);
    const creditCard = order.full.details.payment.creditCard;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order #${this.escapeHtml(order.full.orderNumber)}</title>
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
        <h2>Order #${this.escapeHtml(order.full.orderNumber)}</h2>

        <div class="section">
          <h3>Pickup Information</h3>
          <p><strong>${this.escapeHtml(order.full.pickup.name)}</strong></p>
          <p>${this.escapeHtml(order.full.pickup.phone.countryCode)} ${this.escapeHtml(order.full.pickup.phone.number)}</p>
          <p>${this.escapeHtml(order.full.pickup.address)}</p>
          <p>Time: ${this.escapeHtml(order.full.pickup.pickupDate)} ${this.escapeHtml(order.full.pickup.pickupTime)}</p>
        </div>

        <div class="section">
          <h3>Delivery Information</h3>
          <p><strong>${this.escapeHtml(order.full.delivery.name)}</strong></p>
          <p>${this.escapeHtml(order.full.delivery.phone.countryCode)} ${this.escapeHtml(order.full.delivery.phone.number)}</p>
          <p>${this.escapeHtml(order.full.delivery.email)}</p>
          <p>${this.escapeHtml(order.full.delivery.address)}</p>
          <p>${this.escapeHtml(order.full.delivery.deliveryDate)} ${this.escapeHtml(order.full.delivery.deliveryTime)}</p>
        </div>

        <div class="section">
          <h3>Items</h3>
          ${order.full.details.items.map((item) => `
            <div class="row">
              <span>${this.escapeHtml(item.itemName)} x ${this.escapeHtml(item.itemQty)}</span>
              <span>${this.escapeHtml(this.money(this.toNumber(item.itemPrice)))}</span>
            </div>
          `).join('')}
        </div>

        <div class="section">
          <div class="row"><span>Subtotal</span><span>${this.escapeHtml(this.money(order.full.details.subtotal))}</span></div>
          <div class="row"><span>Tax (${this.escapeHtml(String(order.full.details.taxRate))}%)</span><span>${this.escapeHtml(this.money(order.full.details.taxAmount))}</span></div>
          <div class="row"><span>Delivery Fees</span><span>${this.escapeHtml(this.money(order.full.details.deliveryFees))}</span></div>
          <div class="row"><span>Tips</span><span>${this.escapeHtml(this.money(order.full.details.deliveryTips))}</span></div>
          <div class="row"><span>Discount</span><span>${this.escapeHtml(this.money(order.full.details.discount))}</span></div>
          <div class="row"><span>Status</span><span>${this.escapeHtml(this.formatStatusLabel(order.tab))}</span></div>
          <div class="row"><span>Payment</span><span>${this.escapeHtml(paymentMethod)}</span></div>
          ${creditCard ? `<div class="row"><span>Card</span><span>${this.escapeHtml(this.maskCard(creditCard.cardNumber))}</span></div>` : ''}
        </div>

        <div class="total">
          <div class="row">
            <span>Total</span>
            <span>${this.escapeHtml(this.money(order.full.details.total))}</span>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private openPrintWindow(order: OrderEntity): void {
    const printContent = this.generatePrintHTML(order);
    const printWindow = window.open('', '', 'height=600,width=800');

    if (!printWindow) {
      this.setFeedback('Popup blocked. Allow popups to print the order.', 'error');
      return;
    }

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  private money(amount: number): string {
    return `C$ ${this.toNumber(amount).toFixed(2)}`;
  }

  private setFeedback(
    message: string,
    tone: 'success' | 'error' | 'info'
  ): void {
    this.feedbackMessage = message;
    this.feedbackTone = tone;
  }

  private isLocalhost(): boolean {
    if (typeof window === 'undefined') return false;

    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  private openMapModule(): void {
    if (typeof window === 'undefined') return;
    window.open('/map', '_blank', 'noopener');
  }

  private persistLocalDemoOrders(): void {
    if (!this.showLocalDemoButton || typeof localStorage === 'undefined') return;
    localStorage.setItem(
      LOCAL_DEMO_ORDERS_STORAGE_KEY,
      JSON.stringify(this.localDemoOrders)
    );
  }

  private restoreLocalDemoOrders(): void {
    if (!this.showLocalDemoButton || typeof localStorage === 'undefined') return;

    const raw = localStorage.getItem(LOCAL_DEMO_ORDERS_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as OrderEntity[];
      this.localDemoOrders = Array.isArray(parsed) ? parsed : [];
      this.localOnlyOrderIds = new Set(this.localDemoOrders.map((order) => order.id));
      this.refreshOrdersState([]);
    } catch {
      localStorage.removeItem(LOCAL_DEMO_ORDERS_STORAGE_KEY);
      this.localDemoOrders = [];
      this.localOnlyOrderIds = new Set<string>();
    }
  }

  private buildDemoSeedTargets(): DemoSeedTarget[] {
    const now = new Date();
    const statuses: Array<{ desiredStatus: OrderTab; readyForPickup: boolean; offsetHours: number }> = [
      { desiredStatus: 'current', readyForPickup: true, offsetHours: 1 },
      { desiredStatus: 'current', readyForPickup: false, offsetHours: 2 },
      { desiredStatus: 'scheduled', readyForPickup: false, offsetHours: 6 },
      { desiredStatus: 'scheduled', readyForPickup: true, offsetHours: 9 },
      { desiredStatus: 'completed', readyForPickup: true, offsetHours: -2 },
      { desiredStatus: 'completed', readyForPickup: false, offsetHours: -4 },
      { desiredStatus: 'incomplete', readyForPickup: false, offsetHours: -1 },
      { desiredStatus: 'history', readyForPickup: false, offsetHours: -24 }
    ];

    return statuses.map((statusConfig, index) => {
      const pickupAt = new Date(now.getTime() + ((statusConfig.offsetHours - 1) * 60 * 60 * 1000));
      const deliveryAt = new Date(now.getTime() + (statusConfig.offsetHours * 60 * 60 * 1000));
      const paymentMethod: PaymentMethodType = index % 3 === 0 ? 'credit_card' : 'cash_on_delivery';
      const baseAmount = 14 + (index * 3);
      const quantity = (index % 3) + 1;
      const fee = 4 + (index % 2);
      const tips = statusConfig.desiredStatus === 'completed' ? 3 : 1.5;
      const discount = index % 4 === 0 ? 2 : 0;
      const subtotal = baseAmount * quantity;
      const taxRate = 13;
      const taxAmount = Math.round(((subtotal * taxRate) / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount + fee + tips - discount) * 100) / 100;
      const orderNo = `DEMO-${Date.now()}-${index + 1}`;

      return {
        desiredStatus: statusConfig.desiredStatus,
        readyForPickup: statusConfig.readyForPickup,
        value: {
          orderNumber: orderNo,
          pickup: {
            name: this.randomVendor(index),
            phone: { countryCode: '+1', number: this.randomDigits(10) },
            address: `${110 + index} ${this.randomStreet()} St, Toronto`,
            pickupDate: this.formatDateForInput(pickupAt),
            pickupTime: this.formatTimeForInput(pickupAt)
          },
          delivery: {
            name: this.randomCustomer(index),
            phone: { countryCode: '+1', number: this.randomDigits(10) },
            email: `demo+${Date.now()}-${index}@dispatch.local`,
            address: `${480 + index} ${this.randomStreet()} Ave, Toronto`,
            deliveryDate: this.formatDateForInput(deliveryAt),
            deliveryTime: this.formatTimeForInput(deliveryAt)
          },
          details: {
            items: [
              {
                itemName: this.randomItem(index),
                itemPrice: String(baseAmount),
                itemQty: String(quantity)
              }
            ],
            taxRate,
            deliveryFees: fee,
            deliveryTips: tips,
            discount,
            subtotal,
            taxAmount,
            total,
            instructions: this.randomInstruction(statusConfig.desiredStatus),
            payment: paymentMethod === 'credit_card'
              ? {
                method: paymentMethod,
                creditCard: {
                  cardholderName: 'Demo Customer',
                  cardNumber: '4242424242424242',
                  expiryMonth: '12',
                  expiryYear: '2030',
                  cvc: '123'
                }
              }
              : { method: paymentMethod }
          }
        }
      };
    });
  }

  private buildDemoDraftValue(): NewOrderFormValue {
    const [draft] = this.buildDemoSeedTargets();
    return structuredClone(draft?.value ?? this.createDefaultNewOrder());
  }

  private formatDateForInput(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private formatTimeForInput(value: Date): string {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  private randomDigits(length: number): string {
    let result = '';
    while (result.length < length) {
      result += Math.floor(Math.random() * 10);
    }
    return result.slice(0, length);
  }

  private randomVendor(index: number): string {
    const vendors = ['North Fork Kitchen', 'Golden Pantry', 'Lime Cart', 'Harbor Deli', 'Summit Pizza'];
    return vendors[index % vendors.length];
  }

  private randomCustomer(index: number): string {
    const customers = ['Maya Chen', 'Owen Patel', 'Lena Brooks', 'Isaac Reed', 'Nadia Flores'];
    return customers[index % customers.length];
  }

  private randomStreet(): string {
    const streets = ['King', 'Queen', 'Bloor', 'Dundas', 'Front', 'Jarvis', 'Bathurst'];
    return streets[Math.floor(Math.random() * streets.length)] ?? 'King';
  }

  private randomItem(index: number): string {
    const items = ['Burger Combo', 'Sushi Tray', 'Salad Bowl', 'Pasta Box', 'Coffee Pack'];
    return items[index % items.length];
  }

  private randomInstruction(status: OrderTab): string {
    const byStatus: Record<OrderTab, string[]> = {
      current: ['Call on arrival.', 'Leave at concierge.', 'Rush order for lunch service.'],
      scheduled: ['Deliver after 6 PM.', 'Hold at vendor until notified.', 'Customer requested evening drop.'],
      completed: ['Delivered to front desk.', 'Completed with signature.', 'Handed off to customer directly.'],
      incomplete: ['Customer unreachable.', 'Address needs confirmation.', 'Vendor delayed package release.'],
      history: ['Archived demo record.', 'Previous week recurring order.', 'Kept for reporting demo.']
    };
    const options = byStatus[status];
    return options[Math.floor(Math.random() * options.length)] ?? '';
  }
}
