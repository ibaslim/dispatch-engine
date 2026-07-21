import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PageComponent } from '@components/page/page.component';
import { TableComponent } from '@components/table/table.component';
import { SearchBarComponent } from '@components/search-bar/search-bar.component';
import { ButtonComponent } from '@components/button/button.component';
import { NewOrderFormComponent } from '@components/new-order-form/new-order-form.component';
import { PopupComponent } from '@components/popup/popup.component';
import { DirectionsModalComponent } from '@components/directions-modal/directions-modal.component';
import { ReportIncidentModalComponent, ReportIncidentContext } from '@components/report-incident-modal/report-incident-modal.component';
import { AssignDriverModalComponent } from '@components/assign-driver-modal/assign-driver-modal.component';
import { QrScanModalComponent, QrScanContext } from '@components/qr-scan-modal/qr-scan-modal.component';
import { PodCaptureModalComponent, PodCaptureContext } from '@components/pod-capture-modal/pod-capture-modal.component';
import { OrderDetailsModalComponent } from '@components/order-details-modal/order-details-modal.component';
import { PrintOrderModalComponent } from '@components/print-order-modal/print-order-modal.component';
import { ShippingLabelModalComponent } from '@components/shipping-label-modal/shipping-label-modal.component';
import { PublishedOrdersFeedComponent } from '@components/published-orders-feed/published-orders-feed.component';
import { TableColumn } from '@models/table.model';
import { NewOrderFormValue } from '@models/new-order-form/new-order-form.model';
import {OrderActivityStatus, OrderEntity, OrderTab} from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { OrderDocumentService } from '@services/orders/order-document.service';
import { ScheduledOrderPromotionService } from '@services/orders/scheduled-order-promotion.service';
import { AuthService } from '@core/auth/auth.service';
import { ToastService } from '@core/toast/toast.service';
import {
  BackendOrder,
  buildDemoDraftValue,
  createDefaultNewOrder,
  mapBackendOrder,
  toOrderPayload
} from './orders-mapping.util';
import {
  formatStatusLabel,
  parseDateTime,
  toNumber,
  truncateWords
} from './orders-formatting.util';

// Action type controls what happens on click: 'direct' updates the status immediately,
// other types route through a handler in activityActionHandlers (e.g. a modal flow)
// before the status update is applied. Add new entries here to add new checkpoint behaviors.
type ActivityActionType = 'direct' | 'qr-scan' | 'proof-of-delivery';

interface ActivityFlowEntry {
  label: string;
  next: OrderActivityStatus | null;
  actionLabel: string | null;
  actionType: ActivityActionType;
}

const ACTIVITY_STATUS_FLOW: Record<OrderActivityStatus, ActivityFlowEntry> = {
  driver_not_assigned: { label: 'Driver Not Assigned', next: null, actionLabel: null, actionType: 'direct' },
  pickup_initiated: { label: 'Pickup Initiated', next: 'picked_up', actionLabel: 'Mark Picked Up', actionType: 'qr-scan' },
  picked_up: { label: 'Picked Up', next: 'delivery_initiated', actionLabel: 'Start Delivery', actionType: 'direct' },
  delivery_initiated: { label: 'Delivery Initiated', next: 'delivery_in_progress', actionLabel: 'In Transit', actionType: 'direct' },
  delivery_in_progress: { label: 'Delivery In Progress', next: 'delivered', actionLabel: 'Mark Delivered', actionType: 'proof-of-delivery' },
  delivered: { label: 'Delivered', next: null, actionLabel: null, actionType: 'direct' },
};

// Which checkpoint an incident report belongs to, based on the order's current activity status.
const INCIDENT_STAGE_BY_ACTIVITY_STATUS: Partial<Record<OrderActivityStatus, 'pickup' | 'delivery'>> = {
  pickup_initiated: 'pickup',
  picked_up: 'delivery',
  delivery_initiated: 'delivery',
  delivery_in_progress: 'delivery',
};

const INCIDENT_REASONS_BY_STAGE: Record<'pickup' | 'delivery', { value: string; label: string }[]> = {
  pickup: [
    { value: 'no_answer', label: 'No answer' },
    { value: 'wrong_address', label: 'Wrong address' },
    { value: 'business_closed', label: 'Business closed' },
    { value: 'parcel_issue', label: 'Parcel issue' },
    { value: 'other', label: 'Other' },
  ],
  delivery: [
    { value: 'no_answer', label: 'No answer' },
    { value: 'wrong_address', label: 'Wrong address' },
    { value: 'refused', label: 'Refused' },
    { value: 'other', label: 'Other' },
  ],
};

// Flat reason -> label lookup for display (stage-agnostic; a reason like 'other' is shared).
const INCIDENT_REASON_LABELS: Record<string, string> = Object.fromEntries(
  [...INCIDENT_REASONS_BY_STAGE.pickup, ...INCIDENT_REASONS_BY_STAGE.delivery].map((r) => [r.value, r.label])
);

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageComponent,
    TableComponent,
    SearchBarComponent,
    ButtonComponent,
    PopupComponent,
    NewOrderFormComponent,
    DirectionsModalComponent,
    ReportIncidentModalComponent,
    AssignDriverModalComponent,
    QrScanModalComponent,
    PodCaptureModalComponent,
    OrderDetailsModalComponent,
    PrintOrderModalComponent,
    ShippingLabelModalComponent,
    PublishedOrdersFeedComponent
  ],
  templateUrl: './orders.component.html'
})
export class OrdersComponent implements OnInit, OnDestroy {

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  get tabs(): string[] {
    if (this.auth.isDriver()) {
      return ['New Orders', 'Current', 'Scheduled', 'Completed', 'Incomplete', 'History','Disputed'];
    }

    return ['Current', 'Scheduled', 'Completed', 'Incomplete', 'History', 'Unassigned','Disputed'];
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
  newOrderValue: NewOrderFormValue = createDefaultNewOrder();

  // ─── Table menu ────────────────────────────────────────────────────────────
  activeMenuRow: { id: string } | null = null;

  // ─── Directions modal ──────────────────────────────────────────────────────
  isDirectionsOpen = false;
  selectedRowForDirections: any = null;

  // ─── Report incident modal ─────────────────────────────────────────────────
  isReportOpen = false;
  reportContext: ReportIncidentContext | null = null;

  // ─── Details modal ─────────────────────────────────────────────────────────
  isDetailsOpen = false;
  selectedOrderForDetails: OrderEntity | null = null;

  // ─── Assign driver modal ───────────────────────────────────────────────────
  isAssignDriverOpen = false;
  selectedOrderForAssignment: OrderEntity | null = null;

  // ─── Label modal ───────────────────────────────────────────────────────────
  isLabelOpen = false;
  selectedOrderForLabel: OrderEntity | null = null;

  // ─── Print order modal ─────────────────────────────────────────────────────
  isPrintOpen = false;
  selectedOrderForPrint: OrderEntity | null = null;

  // ─── QR scan / proof-of-delivery modals ────────────────────────────────────
  isQrScanOpen = false;
  qrScanContext: QrScanContext | null = null;
  isPodOpen = false;
  podContext: PodCaptureContext | null = null;

  // ─── Search & feedback ─────────────────────────────────────────────────────
  searchQuery = '';
  feedbackMessage = '';
  feedbackTone: 'success' | 'error' | 'info' = 'info';
  private notifiedUnassignedOrderIds = new Set<string>();

  showLocalDemoButton = this.isLocalhost();

  // ─── Private ───────────────────────────────────────────────────────────────
  private scheduledRefreshHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderDocumentService: OrderDocumentService,
    private readonly scheduledOrderPromotionService: ScheduledOrderPromotionService,
    private readonly auth: AuthService,
    private readonly toast: ToastService
  ) { }

  get isReadOnlyTenant(): boolean {
    return !this.auth.isPlatformAdmin();
  }

  get isDriver(): boolean {
    return this.auth.isDriver();
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
  }

  ngOnDestroy(): void {
    if (this.scheduledRefreshHandle) {
      clearInterval(this.scheduledRefreshHandle);
    }
  }

  // ─── Tab ───────────────────────────────────────────────────────────────────

  setActiveTab(tab: string): void {
    this.closeMenu();
    this.activeTab = tab;
  }

  // ─── Orders loading ────────────────────────────────────────────────────────

  loadOrders(): void {
    this.ordersService.getOrders().subscribe({
      next: (res: BackendOrder[]) => {
        this.orders = res.map((order) => mapBackendOrder(order, this.auth.isDriver()));
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
    {key : 'activityStatus', label: 'Activity Status', sortable: false },
    { key: 'directions', label: 'Directions', sortable: false },
    { key: 'incidentReport', label: 'Reported Issue', sortable: false },
    { key: 'actions', label: '', sortable: false }
  ];

  get columns(): TableColumn[] {
    const showPickupAndDriver = this.activeTab === 'Current' || this.activeTab === 'Scheduled';

    let base = this.auth.isDriver()
      ? this.unifiedColumns
      : this.unifiedColumns.filter((c) => c.key !== 'directions');

    if (this.activeTab !== 'Disputed') {
      base = base.filter((c) => c.key !== 'incidentReport');
    }

    if (showPickupAndDriver) {
      return this.isReadOnlyTenant
        ? base.filter((c) => c.key !== 'readyForPickup')
        : base;
    }

    return base.filter((c) => c.key !== 'readyForPickup' && c.key !== 'driver');
  }

  // ─── Driver "New Orders" feed (app-published-orders-feed) ─────────────────

  onOrderAccepted(order: OrderEntity): void {
    this.loadOrders();
    this.setActiveTab(this.toTabLabel(order.tab));
    this.selectedOrderForDetails = order;
    this.isDetailsOpen = true;
  }

  // ─── Table rows ────────────────────────────────────────────────────────────

  get rows(): Array<Record<string, unknown>> {
    const tabKey = this.getTabKey(this.activeTab);
    const q = this.searchQuery.trim().toLowerCase();

    return this.orders
  .filter((order) =>
    this.activeTab === 'Unassigned'
      ? this.isExpiredUnassignedOrder(order)
      : this.activeTab === 'Disputed'
      ? this.hasIncidentReport(order)
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

    const activityStatus = order.view.current.activityStatus as OrderActivityStatus;
    const flow = ACTIVITY_STATUS_FLOW[activityStatus];
    row['activityStatusLabel'] = flow?.label ?? activityStatus;

    if (this.auth.isDriver() && this.activeTab === 'Current' && flow?.next) {
      row['activityStatusAction'] = flow.actionLabel;
      row['activityStatusNext'] = flow.next;
      row['activityStatusActionType'] = flow.actionType;
    }

    const incidentStage = INCIDENT_STAGE_BY_ACTIVITY_STATUS[activityStatus];
    if (this.auth.isDriver() && this.activeTab === 'Current' && incidentStage) {
      row['canReportIncident'] = true;
      row['incidentStage'] = incidentStage;
      row['incidentAlreadyReported'] = this.hasIncidentReport(order);
    }

    if (this.auth.isDriver()) {
      row['showDirections'] = true;
      row['pickupAddress'] = order.full.pickup.address;
      row['deliveryAddress'] = order.full.delivery.address;
    }

    if (this.activeTab === 'Disputed') {
      const report = order.full.details.incidentReport;
      if (report) {
        const reasonLabel = this.incidentReasonLabel(report.reason);
        const summary = report.description ? `${reasonLabel} — ${report.description}` : reasonLabel;
        row['incidentReportSummary'] = truncateWords(summary, 7);
        row['incidentReportStage'] = report.stage === 'pickup' ? 'Pickup' : 'Delivery';
      }
    }

    return row;
  });
  }

  get emptyTitle(): string {
    if (this.activeTab === 'Unassigned') return 'No unassigned orders';
    if (this.activeTab === 'Disputed') return 'No disputed orders';
    return 'No data available';
  }

  get emptySubtitle(): string {
    if (this.activeTab === 'Unassigned') return 'Expired published orders that no driver accepted will appear here.';
    if (this.activeTab === 'Disputed') return 'Orders with a driver-reported issue (e.g. sender/recipient absent) will appear here.';
    return '';
  }

  // ─── Context menu ──────────────────────────────────────────────────────────

  toggleMenu(row: { id: string }): void {
    this.activeMenuRow = this.activeMenuRow?.id === row.id ? null : row;
  }

  closeMenu(): void {
    this.activeMenuRow = null;
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
  }

  get selectedOrderReadyForPickup(): boolean {
    return this.selectedOrderForDetails ? this.getReadyForPickupStatus(this.selectedOrderForDetails.id) : false;
  }

  async handleDetailsMenu(action: string): Promise<void> {
    if (!this.selectedOrderForDetails) return;

    const selectedOrder = this.selectedOrderForDetails;
    const id = selectedOrder.id;

    if (action === 'pdf') {
      await this.orderDocumentService.downloadOrderPdf(selectedOrder);
      return;
    }

    if (action === 'done' || action === 'failed' || action === 'history') {
      const nextStatus: OrderTab =
        action === 'done' ? 'completed' :
          action === 'failed' ? 'incomplete' :
            'history';

      this.ordersService.updateStatus(id, nextStatus).subscribe({
        next: () => {
          this.setFeedback(`Order ${selectedOrder.full.orderNumber ?? ''} updated to ${formatStatusLabel(nextStatus)}.`, 'success');
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

  openDirections(row: any): void {
    this.selectedRowForDirections = row;
    this.isDirectionsOpen = true;
  }

  closeDirections(): void {
    this.isDirectionsOpen = false;
    this.selectedRowForDirections = null;
  }

  openReportModal(row: any): void {
    const stage = row.incidentStage as 'pickup' | 'delivery' | undefined;
    if (!stage) return;

    const order = this.orders.find((o) => o.id === row.id);
    if (order && this.hasIncidentReport(order)) {
      this.toast.warning('Issue already reported.');
      return;
    }

    this.reportContext = { id: row.id, stage, orderNo: row.orderNo ?? null };
    this.isReportOpen = true;
  }

  closeReportModal(): void {
    this.isReportOpen = false;
    this.reportContext = null;
  }

  // Registry of handlers keyed by ActivityFlowEntry.actionType. To add a new checkpoint
  // behavior (photo capture, signature, OTP, etc.), add a case to ActivityActionType and
  // a handler here — the click plumbing in the table component doesn't need to change.
  private activityActionHandlers: Record<ActivityActionType, (event: { id: string; next: string }) => void> = {
    direct: (event) => this.applyActivityStatus(event.id, event.next),
    'qr-scan': (event) => this.openQrScanModal(event.id, event.next as OrderActivityStatus),
    'proof-of-delivery': (event) => this.openPodModal(event.id, event.next as OrderActivityStatus),
  };

  onActivityStatusAction(event: { id: string; next: string; type?: string }): void {
    const handler = this.activityActionHandlers[(event.type as ActivityActionType) ?? 'direct']
      ?? this.activityActionHandlers.direct;
    handler(event);
  }

  private applyActivityStatus(id: string, next: string): void {
    this.ordersService.updateActivityStatus(id, next).subscribe({
      next: () => {
        this.setFeedback('Activity status updated.', 'success');
        this.loadOrders();

        if (next === 'delivery_initiated') {
          this.ordersService.sendRecipientNotification(id).subscribe({
            error: () => this.setFeedback('Unable to notify the recipient by email.', 'error')
          });
        }
      },
      error: () => this.setFeedback('Unable to update activity status.', 'error')
    });
  }

  // ─── QR scan modal ─────────────────────────────────────────────────────────

  private openQrScanModal(id: string, next: OrderActivityStatus): void {
    const orderNo = this.orders.find((o) => o.id === id)?.view.current.orderNo ?? null;
    this.qrScanContext = { id, next, orderNo };
    this.isQrScanOpen = true;
  }

  closeQrScanModal(): void {
    this.isQrScanOpen = false;
    this.qrScanContext = null;
  }

  onQrMatched(event: { id: string; next: OrderActivityStatus }): void {
    this.closeQrScanModal();
    this.applyActivityStatus(event.id, event.next);
  }

  // ─── Proof-of-delivery modal ────────────────────────────────────────────────

  private openPodModal(id: string, next: OrderActivityStatus): void {
    const order = this.orders.find((o) => o.id === id);
    const signatureRequired = !!order?.full.details.proofOfDelivery?.signature;

    this.podContext = { id, next, orderNo: order?.view.current.orderNo ?? null, signatureRequired };
    this.isPodOpen = true;
  }

  closePodModal(): void {
    this.isPodOpen = false;
    this.podContext = null;
  }

  onPodDelivered(event: { id: string; next: OrderActivityStatus }): void {
    this.closePodModal();
    this.applyActivityStatus(event.id, event.next);
  }

  getReadyForPickupStatus(orderId: string): boolean {
    if (this.readyForPickupMap.has(orderId)) {
      return this.readyForPickupMap.get(orderId) ?? false;
    }
    return !!this.orders.find((o) => o.id === orderId)?.view.current.readyForPickup;
  }

  // ─── Scheduled order promotion ─────────────────────────────────────────────

  async checkAndUpdateScheduledOrders(): Promise<void> {
    await this.scheduledOrderPromotionService.checkAndUpdateScheduledOrders(
      this.orders,
      () => this.loadOrders(),
      (message) => this.setFeedback(message, 'error')
    );
  }

  // ─── New order modal ───────────────────────────────────────────────────────

  openNewOrder(): void {
    if (this.isReadOnlyTenant) {
      this.setFeedback('Read-only access for tenant users.', 'info');
      return;
    }
    this.newOrderValue = createDefaultNewOrder();
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
    const payload = toOrderPayload(this.newOrderValue);
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
    const payload = toOrderPayload(this.newOrderValue);

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
    this.newOrderValue = buildDemoDraftValue();
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
    this.isAssignDriverOpen = true;
  }

  closeAssignDriver(): void {
    this.isAssignDriverOpen = false;
    this.selectedOrderForAssignment = null;
  }

  onDriverAssigned(): void {
    this.loadOrders();
    this.closeAssignDriver();
  }

  onDriverUnassigned(): void {
    this.loadOrders();
    this.closeAssignDriver();
  }

  // ─── Label modal ───────────────────────────────────────────────────────────

  openPrintLabel(order: OrderEntity): void {
    this.selectedOrderForLabel = structuredClone(order);
    this.isLabelOpen = true;
  }

  closePrintLabel(): void {
    this.isLabelOpen = false;
    this.selectedOrderForLabel = null;
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

  onPickupPin(): void { this.openMapModule(); }
  onDeliveryPin(): void { this.openMapModule(); }

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

  private hasIncidentReport(order: OrderEntity): boolean {
    return order.full.details.incidentReport !== null;
  }

  incidentReasonLabel(reason: string): string {
    return INCIDENT_REASON_LABELS[reason] ?? reason;
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

  // ─── Private: helpers ──────────────────────────────────────────────────────

  private checkFormErrors(): boolean {
    const value = this.newOrderValue;
    if (!value.pickup.name.trim()) return true;
    if (!value.pickup.address.trim()) return true;
    if (!value.pickup.location) return true;
    if (!value.pickup.email.trim()) return true;
    if (!value.pickup.pickupDate || !value.pickup.pickupTime) return true;
    if (!this.isValidPhone(value.pickup.phone.number)) return true;
    if (!value.delivery.name.trim()) return true;
    if (!value.delivery.email.trim() || !this.isValidEmail(value.delivery.email)) return true;
    if (!value.delivery.address.trim()) return true;
    if (!value.delivery.location) return true;
    if (!value.delivery.deliveryDate || !value.delivery.deliveryTime) return true;
    if (!this.isValidPhone(value.delivery.phone.number)) return true;
    if (this.isDeliveryBeforeOrEqualPickup(value)) return true;
    if (!value.deliveryCategoryId || !value.routeQuote) return true;

    const hasValidItem = (value.details.items || []).some((item) =>
      item.itemName.trim() && toNumber(item.itemPrice) > 0 && toNumber(item.itemQty) > 0
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
    const pickupDT = parseDateTime(value.pickup.pickupDate, value.pickup.pickupTime);
    const deliveryDT = parseDateTime(value.delivery.deliveryDate, value.delivery.deliveryTime);
    if (!pickupDT || !deliveryDT) return false;
    return deliveryDT.getTime() <= pickupDT.getTime();
  }

  private isExpiredUnassignedOrder(order: OrderEntity): boolean {
    return order.isExpiredUnassigned === true;
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
      disputed: 'Disputed',
    };
    return labels[tab];
  }

  private setFeedback(message: string, tone: 'success' | 'error' | 'info'): void {
    this.feedbackMessage = message;
    this.feedbackTone = tone;
    this.toast.show(tone === 'info' ? 'warning' : tone, message);
  }

  private isLocalhost(): boolean {
    if (typeof window === 'undefined') return false;
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  private openMapModule(): void {
    if (typeof window === 'undefined') return;
    window.open('/map', '_blank', 'noopener');
  }
}
