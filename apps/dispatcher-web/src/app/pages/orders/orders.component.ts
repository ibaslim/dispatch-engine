import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { PopupComponent } from '../../components/popup/popup.component';
import { NewOrderFormComponent } from '../../components/new-order-form/new-order-form.component';
import { ToggleButtonComponent } from '../../components/toggle-button/toggle-button.component';
import { TableColumn } from '../../models/table.model';
import { NewOrderFormValue, PaymentMethodType } from '../../models/new-order-form/new-order-form.model';
import { TenantDriverEntity } from '../../models/drivers/tenant-driver.model';
import { OrderEntity, OrderTab } from '../../models/orders/order-entity.model';
import { OrderView } from '../../models/orders/order-tabs.model';
import { OrdersService } from '../../services/orders/orders.service';
import { AuthService } from '../../core/auth/auth.service';

type BackendOrderItem = {
  itemName: string;
  itemPrice: number;
  itemQty: number;
};

type BackendOrder = {
  id: string;
  created_at: string;
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
  proof_of_delivery?: Record<string, unknown> | null;
  status: OrderTab;
  published?: boolean;
  published_at?: string | null;
  ready_for_pickup: boolean;
  order_placed_time?: string | null;
  driver?: {
    id: string;
    name: string;
    contact_name?: string | null;
    contact_phone_country_code?: string | null;
    contact_phone_number?: string | null;
  } | null;
};

type AssignableDriver = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
};

const PUBLISH_WINDOW_MS = 15 * 60 * 1000;

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

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  get tabs(): string[] {
    if (this.auth.isDriver()) {
      return ['New Orders', 'Current', 'Scheduled', 'Completed', 'Incomplete', 'History'];
    }

    return ['Current', 'Scheduled', 'Completed', 'Incomplete', 'History', 'Unassigned'];
  }
  activeTab = 'Current';

  get hasUnassignedOrders(): boolean {
    return !this.isReadOnlyTenant
      && this.orders.some((order) => this.isExpiredUnassignedOrder(order));
  }

  // ─── Form ──────────────────────────────────────────────────────────────────
  formSubmitted = signal(false);

  // ─── Orders state ──────────────────────────────────────────────────────────
  orders: OrderEntity[] = [];
  editingOrderId: string | null = null;
  readyForPickupMap = new Map<string, boolean>();

  // ─── New order modal ───────────────────────────────────────────────────────
  isNewOrderOpen = false;
  isSavingOrder = false;
  isPublishingOrder = false;
  newOrderValue: NewOrderFormValue = this.createDefaultNewOrder();

  // ─── Table menu ────────────────────────────────────────────────────────────
  activeMenuRow: { id: string } | null = null;

  // ─── Details modal ─────────────────────────────────────────────────────────
  isDetailsOpen = false;
  selectedOrderForDetails: OrderEntity | null = null;
  isDetailsMenuOpen = false;

  // ─── Assign driver modal ───────────────────────────────────────────────────
  isAssignDriverOpen = false;
  selectedOrderForAssignment: OrderEntity | null = null;
  assignDriverQuery = '';
  selectedDriverId = '';
  availableAssignableDrivers: AssignableDriver[] = [];
  isLoadingAssignableDrivers = false;
  assignDriverLoadError = '';

  // ─── Label modal ───────────────────────────────────────────────────────────
  isLabelOpen = false;
  selectedOrderForLabel: OrderEntity | null = null;

  // ─── Print order modal ─────────────────────────────────────────────────────
  isPrintOpen = false;
  selectedOrderForPrint: OrderEntity | null = null;

  // ─── Search & feedback ─────────────────────────────────────────────────────
  searchQuery = '';
  feedbackMessage = '';
  feedbackTone: 'success' | 'error' | 'info' = 'info';
  private notifiedUnassignedOrderIds = new Set<string>();

  showLocalDemoButton = this.isLocalhost();

  // ─── Private ───────────────────────────────────────────────────────────────
  private scheduledRefreshHandle: ReturnType<typeof setInterval> | null = null;
  private scheduledPromotionInFlight = false;

  private ws: WebSocket | null = null;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  publishedOrders: any[] = [];
  
  // ─── Details menu items ────────────────────────────────────────────────────
  get detailsMenuItems(): Array<{ label: string; action: string; icon: string; danger?: boolean }> {
    const items: Array<{ label: string; action: string; icon: string; danger?: boolean }> = [
      { label: 'Mark as Done', action: 'done', icon: 'ph ph-check-circle' },
      { label: 'Mark as Failed', action: 'failed', icon: 'ph ph-x-circle' },
      { label: 'Move to History', action: 'history', icon: 'ph ph-archive' },
      { label: 'Download PDF', action: 'pdf', icon: 'ph ph-download' },
    ];
    
    if (!this.isReadOnlyTenant) {
      items.push({ label: 'Delete Order', action: 'delete', icon: 'ph ph-trash', danger: true });
    }
    
    return items;
  }

  constructor(
    private readonly ordersService: OrdersService,
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) { }

  get isReadOnlyTenant(): boolean {
    return !this.auth.isPlatformAdmin();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    if (this.auth.isDriver()) {
      this.activeTab = 'New Orders';
    }
    
    this.loadOrders();
    this.scheduledRefreshHandle = setInterval(() => {
      void this.checkAndUpdateScheduledOrders();
    }, 6000);

    if (this.auth.isDriver()) {
      this.loadPublishedOrders();
      this.connectWebSocket();
      this.countdownHandle = setInterval(() => this.tickCountdowns(), 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.scheduledRefreshHandle) {
      clearInterval(this.scheduledRefreshHandle);
    }
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
    }
    this.ws?.close();
  }

  // ─── Tab ───────────────────────────────────────────────────────────────────

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  // ─── Orders loading ────────────────────────────────────────────────────────

  loadOrders(): void {
    this.ordersService.getOrders().subscribe({
      next: (res: BackendOrder[]) => {
        this.orders = res.map((order) => this.mapBackendOrder(order));
        this.notifyNewUnassignedOrders();
        this.readyForPickupMap.clear();
        for (const order of this.orders) {
          this.readyForPickupMap.set(order.id, !!order.view.current.readyForPickup);
        }

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

  // ─── Table columns ─────────────────────────────────────────────────────────

  unifiedColumns: TableColumn[] = [
    { key: 'orderNo', label: 'Order Number', sortable: true },
    { key: 'customerName', label: 'Customer Name', sortable: true },
    { key: 'vendorName', label: 'Partner Name', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    // { key: 'distance', label: 'Distance', sortable: true },
    { key: 'orderPlacedTime', label: 'Order Placed Time', sortable: true },
    { key: 'pickupTime', label: 'Pickup Time', sortable: true },
    { key: 'estDeliveryTime', label: 'Est. Delivery Time', sortable: true },
    { key: 'readyForPickup', label: 'Ready for Pickup', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'orderStatus', label: 'Order Status', sortable: true },
    { key: 'trackingStatus', label: 'Tracking Status', sortable: true },
    { key: 'actions', label: '', sortable: false }
  ];

  get columns(): TableColumn[] {
    const showPickupAndDriver = this.activeTab === 'Current' || this.activeTab === 'Scheduled';

    if (showPickupAndDriver) {
      return this.isReadOnlyTenant
        ? this.unifiedColumns.filter((c) => c.key !== 'readyForPickup')
        : this.unifiedColumns;
    }

    const filtered = this.unifiedColumns.filter((c) => c.key !== 'readyForPickup' && c.key !== 'driver');
    return this.isReadOnlyTenant
      ? filtered
      : filtered;
  }

  // ─── Driver Broadcast ──────────────────────────────────────────────────────

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
            this.loadOrders();
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
      const mappedOrder = this.mapBackendOrder(acceptedOrder as BackendOrder);
      card.accepted = true;
      this.publishedOrders = this.publishedOrders.filter(p => p.id !== card.id);
      this.loadOrders();
      this.setActiveTab(this.toTabLabel(mappedOrder.tab));
      this.selectedOrderForDetails = mappedOrder;
      this.isDetailsOpen = true;
    } catch (err: any) {
      this.setFeedback(err?.error?.detail || 'Failed to accept order.', 'error');
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

  // ─── Table rows ────────────────────────────────────────────────────────────

  get rows(): Array<Record<string, unknown>> {
    const tabKey = this.getTabKey(this.activeTab);
    const q = this.searchQuery.trim().toLowerCase();

    return this.orders
  .filter((order) =>
    this.activeTab === 'Unassigned'
      ? this.isExpiredUnassignedOrder(order)
      : order.tab === tabKey && !this.isExpiredUnassignedOrder(order)
  )
  .filter((order) => {
    if (!q) return true;

    const view = order.view.current;

    return (
      view.orderNo.toLowerCase().includes(q) ||
      view.customerName.toLowerCase().includes(q) ||
      view.vendorName.toLowerCase().includes(q)
    );
  })
  .sort((a, b) => {
    const timeA = a.view.current.orderPlacedTime
      ? new Date(a.view.current.orderPlacedTime).getTime()
      : 0;

    const timeB = b.view.current.orderPlacedTime
      ? new Date(b.view.current.orderPlacedTime).getTime()
      : 0;

    return timeB - timeA; // newest first
  })
  .map((order) => {
    const row = {
      ...order.view.current,
      id: order.id
    } as Record<string, unknown>;

    if (this.isReadOnlyTenant && (!row['driver'] || row['driver'] === '')) {
      row['driver'] = '?';
    }

    return row;
  });
  }

  get emptyTitle(): string {
    return this.activeTab === 'Unassigned'
      ? 'No unassigned orders'
      : 'No data available';
  }

  get emptySubtitle(): string {
    return this.activeTab === 'Unassigned'
      ? 'Expired published orders that no driver accepted will appear here.'
      : '';
  }

  // ─── Context menu ──────────────────────────────────────────────────────────

  toggleMenu(row: { id: string }): void {
    this.activeMenuRow = this.activeMenuRow?.id === row.id ? null : row;
  }

  getContextMenuItems(): Array<{ label: string; action: string; icon: string }> {
    if (this.isReadOnlyTenant) {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Print Order', action: 'print', icon: 'ph ph-printer' },
        { label: 'Print Label', action: 'printLabel', icon: 'ph ph-tag' }
      ];
    }

    if (this.activeTab === 'History') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Print Order', action: 'print', icon: 'ph ph-printer' },
        { label: 'Print Label', action: 'printLabel', icon: 'ph ph-tag' }
      ];
    }

    if (this.activeTab === 'Unassigned') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Assign Driver', action: 'assignDriver', icon: 'ph ph-user-plus' },
        { label: 'Print Order', action: 'print', icon: 'ph ph-printer' },
        { label: 'Print Label', action: 'printLabel', icon: 'ph ph-tag' }
      ];
    }

    if (this.activeTab === 'Completed' || this.activeTab === 'Incomplete') {
      return [
        { label: 'Details', action: 'details', icon: 'ph ph-eye' },
        { label: 'Assign Driver', action: 'assignDriver', icon: 'ph ph-user-plus' },
        { label: 'Redrop', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' },
        { label: 'Move to History', action: 'moveToHistory', icon: 'ph ph-archive-box' },
        { label: 'Print Order', action: 'print', icon: 'ph ph-printer' },
        { label: 'Print Label', action: 'printLabel', icon: 'ph ph-tag' }
      ];
    }

    const baseItems = [
      { label: 'Details', action: 'details', icon: 'ph ph-eye' },
      { label: 'Assign Driver', action: 'assignDriver', icon: 'ph ph-user-plus' },
      { label: 'Edit', action: 'edit', icon: 'ph ph-pencil-simple' },
      { label: 'Print Order', action: 'print', icon: 'ph ph-printer' },
      { label: 'Print Label', action: 'printLabel', icon: 'ph ph-tag' }
    ];

    if (this.activeTab === 'Scheduled') {
      baseItems.push({ label: 'Move to Current', action: 'moveToCurrent', icon: 'ph ph-arrow-up-right' });
    }

    return baseItems;
  }

  handleMenuAction(event: { action: string }, row: { orderNo: string }): void {
    const order = this.findOrderByOrderNo(row.orderNo);
    if (!order) return;

    if (
      this.isReadOnlyTenant &&
      event.action !== 'details' &&
      event.action !== 'print' &&
      event.action !== 'printLabel'
    ) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      this.activeMenuRow = null;
      return;
    }

    switch (event.action) {
      case 'moveToCurrent':
        this.ordersService.updateStatus(order.id, 'current').subscribe({
          next: () => {
            this.setFeedback(`Order ${order.full.orderNumber ?? ''} moved to Current.`, 'success');
            this.loadOrders();
          },
          error: () => this.setFeedback('Unable to update order status.', 'error')
        });
        break;

      case 'moveToHistory':
        this.ordersService.updateStatus(order.id, 'history').subscribe({
          next: () => {
            this.setFeedback(`Order ${order.full.orderNumber ?? ''} moved to History.`, 'success');
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
        this.openPrintOrder(order);
        break;

      case 'printLabel':
        this.openPrintLabel(order);
        break;

      case 'delete':
        this.ordersService.deleteOrder(order.id).subscribe({
          next: () => {
            this.setFeedback(`Order ${order.full.orderNumber ?? ''} deleted.`, 'success');
            this.loadOrders();
          },
          error: () => this.setFeedback('Unable to delete order.', 'error')
        });
        break;
    }

    this.activeMenuRow = null;
  }

  // ─── Details modal ─────────────────────────────────────────────────────────

  closeDetails(): void {
    this.isDetailsOpen = false;
    this.selectedOrderForDetails = null;
    this.isDetailsMenuOpen = false;
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

      this.ordersService.updateStatus(id, nextStatus).subscribe({
        next: () => {
          this.setFeedback(`Order ${selectedOrder.full.orderNumber ?? ''} updated to ${this.formatStatusLabel(nextStatus)}.`, 'success');
          this.closeDetails();
          this.loadOrders();
        },
        error: () => this.setFeedback('Unable to update order status.', 'error')
      });
      return;
    }

    if (action === 'delete') {
      this.ordersService.deleteOrder(id).subscribe({
        next: () => {
          this.setFeedback(`Order ${selectedOrder.full.orderNumber ?? ''} deleted.`, 'success');
          this.closeDetails();
          this.loadOrders();
        },
        error: () => this.setFeedback('Unable to delete order.', 'error')
      });
    }
  }

  // ─── Ready for pickup ──────────────────────────────────────────────────────

  updateReadyForPickup(isReady: boolean): void {
    if (!this.selectedOrderForDetails) return;

    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }

    const id = this.selectedOrderForDetails.id;
    this.setReadyForPickupLocal(id, isReady);

    this.ordersService.toggleReady(id, isReady).subscribe({
      next: () => { this.readyForPickupMap.set(id, isReady); },
      error: () => {
        this.setFeedback('Unable to update ready-for-pickup state.', 'error');
        this.loadOrders();
      }
    });
  }

  updateReadyForPickupFromRow(orderId: string, isReady: boolean): void {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    this.setReadyForPickupLocal(orderId, isReady);

    this.ordersService.toggleReady(orderId, isReady).subscribe({
      next: () => { this.readyForPickupMap.set(orderId, isReady); },
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
    return !!this.orders.find((o) => o.id === orderId)?.view.current.readyForPickup;
  }

  // ─── Scheduled order promotion ─────────────────────────────────────────────


// ??? Scheduled order promotion ?????????????????????????????????????????????

async checkAndUpdateScheduledOrders(): Promise<void> {
  if (this.scheduledPromotionInFlight) return;

  this.scheduledPromotionInFlight = true;

  try {
    const now = new Date();
    const twentyFourHoursLater = now.getTime() + (24 * 60 * 60 * 1000); // 24 hours from now

    const candidateIds: string[] = [];

    for (const order of this.orders) {
      if (order.tab !== 'scheduled') continue;

      const pickupDateTime = this.parseDateTime(
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

    this.loadOrders();

  } catch (error) {
    console.error('Failed to promote scheduled orders:', error);
    this.setFeedback('Unable to auto-update scheduled orders.', 'error');
  } finally {
    this.scheduledPromotionInFlight = false;
  }
}

  // ─── New order modal ───────────────────────────────────────────────────────

  openNewOrder(): void {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    this.newOrderValue = this.createDefaultNewOrder();
    this.editingOrderId = null;
    this.formSubmitted.set(false);
    this.isNewOrderOpen = true;
  }

  closeNewOrder(): void {
    this.isNewOrderOpen = false;
    this.isSavingOrder = false;
  }

  async saveNewOrder(): Promise<void> {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    this.formSubmitted.set(true);
    if (this.checkFormErrors() || this.isSavingOrder || this.isPublishingOrder) return;

    this.isSavingOrder = true;
    const payload = this.toOrderPayload(this.newOrderValue);
    const mode = this.editingOrderId ? 'updated' : 'created';

    try {
      if (this.editingOrderId) {
        await firstValueFrom(this.ordersService.updateOrder(this.editingOrderId, payload));
      } else {
        await firstValueFrom(this.ordersService.createOrder(payload));
      }

      this.setFeedback(`Order ${mode} successfully.`, 'success');
      this.loadOrders();
      this.closeNewOrder();
      this.formSubmitted.set(false);
      this.editingOrderId = null;
    } catch (error: any) {
      this.setFeedback(error?.error?.detail || `Failed to save order.`, 'error');
    } finally {
      this.isSavingOrder = false;
    }
  }

  async publishNewOrder(): Promise<void> {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    this.formSubmitted.set(true);
    if (this.checkFormErrors() || this.isSavingOrder || this.isPublishingOrder) return;

    this.isPublishingOrder = true;
    const payload = this.toOrderPayload(this.newOrderValue);

    try {
      let orderId: string;

      if (this.editingOrderId) {
        const updated = await firstValueFrom(this.ordersService.updateOrder(this.editingOrderId, payload));
        orderId = this.editingOrderId;
      } else {
        const created = await firstValueFrom(this.ordersService.createOrder(payload));
        orderId = created.id;
      }

      // Now publish — triggers WS broadcast to all online drivers
      await firstValueFrom(this.ordersService.publishOrder(orderId));

      this.setFeedback('Order published to drivers successfully! Drivers have 15 minutes to accept.', 'success');
      this.loadOrders();
      this.closeNewOrder();
      this.formSubmitted.set(false);
      this.editingOrderId = null;
    } catch (error: any) {
      this.setFeedback(error?.error?.detail || 'Failed to publish order.', 'error');
    } finally {
      this.isPublishingOrder = false;
    }
  }

  editOrder(order: OrderEntity): void {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    this.newOrderValue = structuredClone(order.full);
    this.editingOrderId = order.id;
    this.formSubmitted.set(false);
    this.isNewOrderOpen = true;
  }

  fillNewOrderWithDummyData(): void {
    this.newOrderValue = this.buildDemoDraftValue();
    this.formSubmitted.set(false);
    this.setFeedback('Demo data filled in the order form.', 'success');
  }

  // ─── Assign driver modal ───────────────────────────────────────────────────

  openAssignDriver(row: { id: string } | OrderEntity): void {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    const order = this.orders.find((item) => item.id === row.id);
    if (!order) return;

    this.selectedOrderForAssignment = structuredClone(order);
    this.assignDriverQuery = '';
    this.isAssignDriverOpen = true;
    void this.loadAssignableDrivers(order.id);
  }

  closeAssignDriver(): void {
    this.isAssignDriverOpen = false;
    this.selectedOrderForAssignment = null;
    this.assignDriverQuery = '';
    this.selectedDriverId = '';
  }

  async assignSelectedDriver(): Promise<void> {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    if (!this.selectedOrderForAssignment || !this.selectedDriverId) {
      this.setFeedback('Select a driver to assign.', 'error');
      return;
    }
    try {
      await firstValueFrom(
        this.ordersService.assignDriver(this.selectedOrderForAssignment.id, this.selectedDriverId)
      );
      this.loadOrders();
      const selectedDriver = this.availableAssignableDrivers.find((driver) => driver.id === this.selectedDriverId);
      const driverLabel = selectedDriver ? selectedDriver.contactName || selectedDriver.name : 'Driver';
      this.setFeedback(
        `${driverLabel} assigned to order ${this.selectedOrderForAssignment.full.orderNumber ?? ''}.`,
        'success'
      );
      this.closeAssignDriver();
    } catch {
      this.setFeedback('Unable to assign driver.', 'error');
    }
  }

  async unassignSelectedDriver(): Promise<void> {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    if (!this.selectedOrderForAssignment) return;
    try {
      await firstValueFrom(this.ordersService.unassignDriver(this.selectedOrderForAssignment.id));
      this.loadOrders();
      this.setFeedback(`Driver removed from order ${this.selectedOrderForAssignment.full.orderNumber ?? ''}.`, 'success');
      this.closeAssignDriver();
    } catch {
      this.setFeedback('Unable to remove driver.', 'error');
    }
  }

  get filteredAssignableDrivers(): AssignableDriver[] {
    const query = this.assignDriverQuery.trim().toLowerCase();
    const drivers = this.availableAssignableDrivers;
    if (!query) return drivers;
    return drivers.filter((driver) =>
      [driver.name, driver.contactName, driver.email, driver.phone, driver.address]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    );
  }

  // ─── Label modal ───────────────────────────────────────────────────────────

  openPrintLabel(order: OrderEntity): void {
    this.selectedOrderForLabel = structuredClone(order);
    this.isLabelOpen = true;
    queueMicrotask(() => {
      this.renderLabelGraphics();
    });
  }

  closePrintLabel(): void {
    this.isLabelOpen = false;
    this.selectedOrderForLabel = null;
  }

  printLabel(): void {
    if (!this.selectedOrderForLabel) return;
    const order = this.selectedOrderForLabel;
    const orderNumber = order.full.orderNumber ?? '';

    const win = window.open('', '', 'height=750,width=520');
    if (!win) {
      this.setFeedback('Popup blocked. Allow popups to print the label.', 'error');
      return;
    }

    win.document.write(`<!DOCTYPE html>
<html><head>
<title>Label - ${this.escapeHtml(orderNumber)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
<style>${this.labelCSS()}</style>
</head><body>
<div class="label-wrapper">
  <div class="top">
    <div class="big-letter">D</div>
    <div class="postage">
      <div class="postage-title">DISPATCH DELIVERY</div>
      <div>Order: ${this.escapeHtml(orderNumber)}</div>
      <div>Placed: ${this.escapeHtml(order.view.current.orderPlacedTime || '')}</div>
      <div>Est. Delivery: ${this.escapeHtml(order.view.current.estDeliveryTime || '')}</div>
      <div class="postage-sub">CommercialBasePrice</div>
    </div>
    <div class="qr-side">
      <span class="rotate">dispatch.local</span>
      <canvas id="qrcode"></canvas>
    </div>
  </div>
  <div class="banner">DISPATCH FIRST-CLASS PKG</div>
  <div class="sender">
    <div class="sender-info">
      <div class="from-label">From</div>
      <div>${this.escapeHtml(order.full.pickup.name)}</div>
      <div>${this.escapeHtml(order.full.pickup.address)}</div>
    </div>
    <div class="order-ref">Order: ${this.escapeHtml(orderNumber)}</div>
  </div>
  <div class="recipient">
    <div class="recipient-name">${this.escapeHtml(order.full.delivery.name)}</div>
    <div class="recipient-addr">${this.escapeHtml(order.full.delivery.address)}</div>
  </div>
  <div class="barcode-section">
    <div class="tracking-title">TRACKING #</div>
    <svg id="barcode"></svg>
    <div class="tracking-num">${this.escapeHtml(orderNumber)}</div>
  </div>
</div>
<script>
  QRCode.toCanvas(document.getElementById('qrcode'), ${JSON.stringify(orderNumber)}, { width: 70, margin: 1 }, function(e){ if(e) console.error(e); });
  JsBarcode('#barcode', ${JSON.stringify(orderNumber)}, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 60 });
  window.onload = function() { setTimeout(function() { window.print(); }, 700); };
<\/script>
</body></html>`);
    win.document.close();
  }

  async downloadLabelPdf(): Promise<void> {
    const el = document.getElementById('label-preview');
    if (!el) return;

    try {
      const canvas = await html2canvas(el, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [101.6, 152.4] });
      const imgHeight = (canvas.height * 101.6) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, 101.6, imgHeight);
      pdf.save(`label-${this.selectedOrderForLabel!.full.orderNumber ?? ''}.pdf`);
    } catch {
      this.setFeedback('Failed to download label PDF.', 'error');
    }
  }

  // ─── Print order modal ─────────────────────────────────────────────────────

  openPrintOrder(order: OrderEntity): void {
    this.selectedOrderForPrint = structuredClone(order);
    this.isPrintOpen = true;
  }

  closePrintOrder(): void {
    this.isPrintOpen = false;
    this.selectedOrderForPrint = null;
  }

  // ─── Misc public ───────────────────────────────────────────────────────────

  maskCard(card: string = ''): string {
    if (!card) return '';
    return card.replace(/\d(?=\d{4})/g, '*');
  }

  formatPaymentMethod(method: PaymentMethodType): string {
    return method === 'credit_card' ? 'Credit card' : 'Cash on delivery';
  }

  onPickupPin(): void { this.openMapModule(); }
  onDeliveryPin(): void { this.openMapModule(); }

  // ─── PDF download (order) ──────────────────────────────────────────────────

  async downloadOrderPdf(order: OrderEntity): Promise<void> {
    const element = document.createElement('div');
    element.innerHTML = this.generatePrintHTML(order);
    element.style.cssText = 'position:absolute;left:-9999px;width:210mm;height:auto;padding:0;margin:0;';
    document.body.appendChild(element);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const imgWidth = 210;
      const pageHeight = 297;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      while (heightLeft >= pageHeight) {
        position = heightLeft - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`order-${order.full.orderNumber ?? ''}.pdf`);
    } finally {
      document.body.removeChild(element);
    }
  }

  // ─── Private: rendering ────────────────────────────────────────────────────

  private async renderLabelGraphics(): Promise<void> {
    if (!this.selectedOrderForLabel) return;

    const orderNumber = this.selectedOrderForLabel.full.orderNumber ?? '';

    await new Promise(resolve => requestAnimationFrame(resolve));

    const canvas = document.getElementById('qrcode') as HTMLCanvasElement | null;
    if (canvas) {
      await QRCode.toCanvas(canvas, orderNumber, { width: 70, margin: 1 });
    }

    const barcodeElement = document.getElementById('barcode');
    if (barcodeElement) {
      JsBarcode('#barcode', orderNumber, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 2,
        height: 60
      });
    }
  }

  private labelCSS(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; background: #fff; display: flex; justify-content: center; padding: 16px; }
      .label-wrapper { width: 384px; border: 2px solid #000; font-size: 11px; background: #fff; color: #000; }
      .top { display: flex; border-bottom: 2px solid #000; padding: 8px; gap: 8px; align-items: flex-start; }
      .big-letter { font-size: 52px; font-weight: 900; line-height: 1; width: 56px; text-align: center; flex-shrink: 0; }
      .postage { flex: 1; font-size: 9px; line-height: 1.6; }
      .postage-title { font-weight: bold; font-size: 10px; }
      .postage-sub { margin-top: 4px; font-size: 8px; color: #777; }
      .qr-side { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .rotate { font-size: 8px; writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 2px; color: #666; }
      canvas { width: 70px !important; height: 70px !important; display: block; }
      .banner { text-align: center; font-size: 15px; font-weight: 900; padding: 5px 8px; border-bottom: 2px solid #000; letter-spacing: 2px; }
      .sender { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px; border-bottom: 2px solid #000; gap: 12px; }
      .sender-info { font-size: 9px; line-height: 1.6; }
      .from-label { font-weight: bold; font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 2px; }
      .order-ref { font-size: 9px; color: #555; white-space: nowrap; flex-shrink: 0; }
      .recipient { padding: 10px 8px 12px; border-bottom: 2px solid #000; }
      .recipient-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
      .recipient-addr { font-size: 11px; line-height: 1.6; }
      .barcode-section { padding: 8px; text-align: center; }
      .tracking-title { font-weight: 900; font-size: 13px; letter-spacing: 2px; margin-bottom: 6px; }
      svg { width: 100%; height: 60px; display: block; }
      .tracking-num { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
      @media print { @page { margin: 0; size: 4in auto; } body { padding: 0; } }
    `;
  }

  // ─── Private: order mapping ────────────────────────────────────────────────

  private mapBackendOrder(order: BackendOrder): OrderEntity {
    const pickupPhone = this.splitPhoneNumber(order.pickup_phone);
    const deliveryPhone = this.splitPhoneNumber(order.delivery_phone);
    const payment = this.mapPaymentDetails(order.payment_method, order.payment_details);
    const isExpiredUnassigned = this.isExpiredUnassignedBackendOrder(order);

    const view: OrderView = {
      orderNo: order.order_number,
      customerName: order.delivery_name,
      vendorName: order.pickup_name,
      amount: this.auth.isDriver()
        ? this.driverEarningsLabel(order.total)
        : this.money(order.total),
      distance: '?',
      orderPlacedTime: order.order_placed_time || '',
      pickupTime: this.formatTime(order.pickup_time),
      estDeliveryTime: this.formatDateTime(order.delivery_date, order.delivery_time),
      readyForPickup: order.ready_for_pickup ?? false,
      driver: order.driver?.contact_name || order.driver?.name || '',
      orderStatus: isExpiredUnassigned ? 'Unassigned' : this.formatStatusLabel(order.status),
      trackingStatus: 'Inactive'
    };

    return {
      id: order.id,
      createdAt: order.created_at,
      isExpiredUnassigned,
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
          payment,
          proofOfDelivery: this.normalizeProofOfDelivery(order.proof_of_delivery)
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

  private async loadAssignableDrivers(selectedOrderId?: string): Promise<void> {
    this.isLoadingAssignableDrivers = true;
    this.assignDriverLoadError = '';

    try {
      const drivers = await firstValueFrom(this.http.get<TenantDriverEntity[]>('/api/v1/drivers/available'));
     console.log('RAW DRIVERS FROM API', drivers);
      this.availableAssignableDrivers = drivers.map((driver: any) => ({
  id: String(driver.id),
  name: String(driver.name ?? '').trim(),
  contactName: String(driver.contact_name ?? '').trim(),
  email: String(driver.contact_email ?? '').trim(),
  phone: this.formatTenantPhone(
    driver.contact_phone_country_code,
    driver.contact_phone_number
  ),
  address: String(driver.address ?? '').trim()
}));

      if (selectedOrderId && this.selectedOrderForAssignment?.id === selectedOrderId) {
        const currentDriverName = this.selectedOrderForAssignment.view.current.driver.trim();
        this.selectedDriverId = this.availableAssignableDrivers.find((driver) =>
          driver.id === currentDriverName || driver.name === currentDriverName || driver.contactName === currentDriverName
        )?.id ?? '';
      }
    } catch {
      this.availableAssignableDrivers = [];
      this.assignDriverLoadError = 'Unable to load drivers.';
      this.setFeedback('Unable to load drivers from tenants.', 'error');
    } finally {
      this.isLoadingAssignableDrivers = false;
    }
  }

  private formatTenantPhone(countryCode: string | null | undefined, number: string | null | undefined): string {
    const code = String(countryCode ?? '').trim();
    const phoneNumber = String(number ?? '').trim();
    if (!code && !phoneNumber) return '';
    if (!code) return phoneNumber;
    if (!phoneNumber) return code;
    return `${code} ${phoneNumber}`;
  }

  private mapPaymentDetails(
    method: PaymentMethodType,
    paymentDetails?: Record<string, unknown> | null
  ): NewOrderFormValue['details']['payment'] {
    if (method !== 'credit_card') return { method };

    const details = paymentDetails ?? {};
    const src = (
      typeof details['creditCard'] === 'object' && details['creditCard'] !== null
        ? details['creditCard'] as Record<string, unknown>
        : details
    );

    return {
      method,
      creditCard: {
        cardholderName: String(src['cardholderName'] ?? ''),
        cardNumber: String(src['cardNumber'] ?? ''),
        expiryMonth: String(src['expiryMonth'] ?? ''),
        expiryYear: String(src['expiryYear'] ?? ''),
        cvc: String(src['cvc'] ?? '')
      }
    };
  }

  private splitPhoneNumber(phone: string): { countryCode: string; number: string } {
    const trimmed = String(phone || '').trim();
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length > 10) {
      return {
        countryCode: `+${digits.slice(0, digits.length - 10)}`,
        number: digits.slice(-10)
      };
    }
    return { countryCode: '+1', number: digits };
  }

  private setReadyForPickupLocal(orderId: string, isReady: boolean): void {
    this.readyForPickupMap.set(orderId, isReady);
    const order = this.orders.find((o) => o.id === orderId);
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

  private findOrderByOrderNo(orderNo: string): OrderEntity | undefined {
    return this.orders.find((o) => o.view.current.orderNo === orderNo);
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

  // ─── Private: print ────────────────────────────────────────────────────────

  openPrintWindow(order: OrderEntity): void {
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

  private generatePrintHTML(order: OrderEntity): string {
    const paymentMethod = this.formatPaymentMethod(order.full.details.payment.method);
    const creditCard = order.full.details.payment.creditCard;

    return `<!DOCTYPE html><html><head>
      <title>Order #${this.escapeHtml(order.full.orderNumber ?? '')}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h2 { text-align: center; margin-bottom: 30px; }
        .section { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
        .section h3 { font-weight: bold; margin-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin: 5px 0; }
        .total { font-weight: bold; font-size: 16px; margin-top: 20px; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>
      <h2>Order #${this.escapeHtml(order.full.orderNumber ?? '')}</h2>
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
          </div>`).join('')}
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
        <div class="row"><span>Total</span><span>${this.escapeHtml(this.money(order.full.details.total))}</span></div>
      </div>
    </body></html>`;
  }

  // ─── Private: helpers ──────────────────────────────────────────────────────

  private toOrderPayload(value: NewOrderFormValue): Record<string, unknown> {
    return {
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
        .filter((item) => item.itemName.trim() && this.toNumber(item.itemPrice) > 0 && this.toNumber(item.itemQty) > 0)
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
      proof_of_delivery: value.details.proofOfDelivery,
      payment_details: value.details.payment.method === 'credit_card'
        ? { creditCard: value.details.payment.creditCard }
        : null
    };
  }

  private formatStatusLabel(status: OrderTab): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
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

  private normalizeProofOfDelivery(value: unknown): NewOrderFormValue['details']['proofOfDelivery'] {
    if (!value || typeof value !== 'object') {
      return { signature: false, picture: false };
    }
    const record = value as Record<string, unknown>;
    return {
      signature: Boolean(record['signature']),
      picture: Boolean(record['picture'])
    };
  }

  private checkFormErrors(): boolean {
    const value = this.newOrderValue;
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

    const hasValidItem = (value.details.items || []).some((item) =>
      item.itemName.trim() && this.toNumber(item.itemPrice) > 0 && this.toNumber(item.itemQty) > 0
    );
    if (!hasValidItem) return true;

    if (value.details.payment.method === 'credit_card') {
      const cc = value.details.payment.creditCard;
      if (!cc) return true;
      if (!/^[A-Za-z\s]+$/.test(cc.cardholderName.trim())) return true;
      if (!/^\d{16}$/.test(cc.cardNumber)) return true;
      if (!/^(0[1-9]|1[0-2])$/.test(cc.expiryMonth)) return true;
      if (!/^\d{4}$/.test(cc.expiryYear)) return true;
      if (!/^\d{3}$/.test(cc.cvc)) return true;
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
    const pickupDT = this.parseDateTime(value.pickup.pickupDate, value.pickup.pickupTime);
    const deliveryDT = this.parseDateTime(value.delivery.deliveryDate, value.delivery.deliveryTime);
    if (!pickupDT || !deliveryDT) return false;
    return deliveryDT.getTime() <= pickupDT.getTime();
  }

  private toNumber(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  driverEarningsLabel(total: unknown): string {
    return this.money(Math.round(this.toNumber(total) * 0.05 * 100) / 100);
  }

  private isExpiredUnassignedOrder(order: OrderEntity): boolean {
    return order.isExpiredUnassigned === true;
  }

  private isExpiredUnassignedBackendOrder(order: BackendOrder): boolean {
    if (!order.published || order.driver?.id) return false;
    if (!order.published_at) return false;

    const publishedAt = new Date(order.published_at).getTime();
    return Number.isFinite(publishedAt) && Date.now() - publishedAt >= PUBLISH_WINDOW_MS;
  }

  private notifyNewUnassignedOrders(): void {
    if (this.isReadOnlyTenant) return;

    const unassignedOrders = this.orders.filter((order) => this.isExpiredUnassignedOrder(order));
    const newUnassigned = unassignedOrders.filter((order) => !this.notifiedUnassignedOrderIds.has(order.id));

    for (const order of unassignedOrders) {
      this.notifiedUnassignedOrderIds.add(order.id);
    }

    if (newUnassigned.length === 0) return;

    const label = newUnassigned.length === 1
      ? `Order ${newUnassigned[0].full.orderNumber} is unassigned.`
      : `${newUnassigned.length} orders are unassigned.`;

    this.setFeedback(`${label} Assign a driver from the Unassigned tab.`, 'info');
  }

  private toTabLabel(tab: OrderTab): string {
    const labels: Record<OrderTab, string> = {
      current: 'Current',
      scheduled: 'Scheduled',
      completed: 'Completed',
      incomplete: 'Incomplete',
      history: 'History',
    };
    return labels[tab];
  }

  private todayYYYYMMDD(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private money(amount: number): string {
    return `C$ ${this.toNumber(amount).toFixed(2)}`;
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private setFeedback(message: string, tone: 'success' | 'error' | 'info'): void {
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

  private createDefaultNewOrder(): NewOrderFormValue {
    return {
      orderNumber: '',
      pickup: { name: '', phone: { countryCode: '+1', number: '' }, address: '', pickupDate: this.todayYYYYMMDD(), pickupTime: '' },
      delivery: { name: '', phone: { countryCode: '+1', number: '' }, email: '', address: '', deliveryDate: this.todayYYYYMMDD(), deliveryTime: '' },
      details: {
        items: [{ itemName: '', itemPrice: '', itemQty: '' }],
        taxRate: 0, deliveryFees: 0, deliveryTips: 0, discount: 0,
        subtotal: 0, taxAmount: 0, total: 0,
        instructions: '', payment: { method: 'cash_on_delivery' },
        proofOfDelivery: { signature: false, picture: false }
      }
    };
  }

  // ─── Demo fill data (form only, no table seeding) ──────────────────────────

  private buildDemoDraftValue(): NewOrderFormValue {
    const now = new Date();
    const pickupAt = new Date(now.getTime() + 1 * 3600000);
    const deliveryAt = new Date(now.getTime() + 2 * 3600000);

    return {
      orderNumber: `DEMO-${Date.now()}`,
      pickup: {
        name: 'North Fork Kitchen',
        phone: { countryCode: '+1', number: '4161234567' },
        address: '110 King St, Toronto',
        pickupDate: this.formatDateForInput(pickupAt),
        pickupTime: this.formatTimeForInput(pickupAt)
      },
      delivery: {
        name: 'Maya Chen',
        phone: { countryCode: '+1', number: '4169876543' },
        email: `demo+${Date.now()}@dispatch.local`,
        address: '480 Queen Ave, Toronto',
        deliveryDate: this.formatDateForInput(deliveryAt),
        deliveryTime: this.formatTimeForInput(deliveryAt)
      },
      details: {
        items: [{ itemName: 'Burger Combo', itemPrice: '14', itemQty: '2' }],
        taxRate: 13,
        deliveryFees: 4,
        deliveryTips: 1.5,
        discount: 0,
        subtotal: 28,
        taxAmount: 3.64,
        total: 37.14,
        instructions: 'Call on arrival.',
        payment: { method: 'cash_on_delivery' },
        proofOfDelivery: { signature: false, picture: false }
      }
    };
  }

  private formatDateForInput(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private formatTimeForInput(value: Date): string {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
}
