import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { auditTime, Subject, takeUntil } from 'rxjs';
import { PageComponent } from '@components/page/page.component';
import { ButtonComponent } from '@components/button/button.component';
import { ScheduleTimelineComponent } from '@components/schedule-timeline/schedule-timeline.component';
import { OrderProgressComponent } from '@components/order-progress/order-progress.component';
import { QrScanModalComponent, QrScanContext } from '@components/qr-scan-modal/qr-scan-modal.component';
import { PodCaptureModalComponent, PodCaptureContext } from '@components/pod-capture-modal/pod-capture-modal.component';
import { ReportIncidentModalComponent, ReportIncidentContext } from '@components/report-incident-modal/report-incident-modal.component';
import { OrderActivityStatus, OrderEntity } from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { AuthService } from '@core/auth/auth.service';
import { ToastService } from '@core/toast/toast.service';
import { PusherService } from '@core/realtime/pusher.service';
import { BackendOrder, mapBackendOrder } from '@pages/orders/orders-mapping.util';
import { driverEarningsLabel } from '@pages/orders/orders-formatting.util';
import {
  ACTIVITY_STATUS_FLOW,
  incidentReasonLabel,
  INCIDENT_STAGE_BY_ACTIVITY_STATUS,
} from '@pages/orders/activity-flow.util';

/**
 * One job in full, as a page rather than a modal — the web counterpart of the
 * driver mobile app's order-detail screen. Reached by clicking an order row
 * while signed in as a driver (`OrdersComponent.onRowClick`); dispatchers keep
 * the existing Details modal.
 */
@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    ButtonComponent,
    ScheduleTimelineComponent,
    OrderProgressComponent,
    QrScanModalComponent,
    PodCaptureModalComponent,
    ReportIncidentModalComponent,
  ],
  templateUrl: './order-detail.component.html',
})
export class OrderDetailComponent implements OnInit, OnDestroy {
  order: OrderEntity | null = null;
  loading = true;
  advancing = false;

  isQrScanOpen = false;
  qrScanContext: QrScanContext | null = null;

  isPodOpen = false;
  podContext: PodCaptureContext | null = null;

  isReportOpen = false;
  reportContext: ReportIncidentContext | null = null;

  protected readonly incidentReasonLabel = incidentReasonLabel;
  protected readonly driverEarningsLabel = driverEarningsLabel;

  private orderId = '';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ordersService: OrdersService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly pusher: PusherService,
  ) { }

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadOrder();
    this.pusher.orderEvents$
      .pipe(auditTime(100), takeUntil(this.destroy$))
      .subscribe(() => this.loadOrder());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadOrder(): void {
    this.ordersService.getOrders().subscribe({
      next: (res: BackendOrder[]) => {
        this.loading = false;
        const match = res.find((item) => item.id === this.orderId);
        this.order = match ? mapBackendOrder(match, this.auth.isDriver()) : null;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Unable to load this order.');
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/orders']);
  }

  navigate(target: 'pickup' | 'delivery'): void {
    if (!this.order) return;
    const address = target === 'pickup' ? this.order.full.pickup.address : this.order.full.delivery.address;
    if (!address) return;

    this.router.navigate(['/map'], {
      queryParams: { destination: address, label: target === 'pickup' ? 'Pickup' : 'Receiver' }
    });
  }

  callHref(phone: { countryCode: string; number: string }): string {
    return `tel:${phone.countryCode}${phone.number}`;
  }

  get activityStatus(): OrderActivityStatus | null {
    return (this.order?.view.current.activityStatus as OrderActivityStatus) ?? null;
  }

  get step() {
    return this.activityStatus ? ACTIVITY_STATUS_FLOW[this.activityStatus] : null;
  }

  get incidentStage(): 'pickup' | 'delivery' | undefined {
    return this.activityStatus ? INCIDENT_STAGE_BY_ACTIVITY_STATUS[this.activityStatus] : undefined;
  }

  get hasIncidentReport(): boolean {
    return !!this.order?.full.details.incidentReport;
  }

  get podRequired(): boolean {
    const proof = this.order?.full.details.proofOfDelivery;
    return !!(proof?.signature || proof?.picture);
  }

  // ─── Primary action: advance the order one checkpoint ─────────────────────

  onPrimaryAction(): void {
    if (!this.order || !this.step?.next) return;
    const { next, actionType } = this.step;

    if (actionType === 'qr-scan') {
      if (this.order.full.details.pickupVerification) {
        this.applyActivityStatus(next);
        return;
      }
      this.qrScanContext = { id: this.order.id, next, orderNo: this.order.full.orderNumber };
      this.isQrScanOpen = true;
      return;
    }

    if (actionType === 'proof-of-delivery') {
      this.podContext = {
        id: this.order.id,
        next,
        orderNo: this.order.full.orderNumber,
        signatureRequired: !!this.order.full.details.proofOfDelivery.signature
      };
      this.isPodOpen = true;
      return;
    }

    this.applyActivityStatus(next);
  }

  private applyActivityStatus(next: OrderActivityStatus): void {
    if (!this.order) return;
    const orderId = this.order.id;
    this.advancing = true;

    this.ordersService.updateActivityStatus(orderId, next).subscribe({
      next: () => {
        this.advancing = false;
        this.toast.success('Activity status updated.');
        this.loadOrder();

        if (next === 'delivery_initiated') {
          this.ordersService.sendRecipientNotification(orderId).subscribe({
            error: () => this.toast.error('Unable to notify the recipient by email.')
          });
        }
      },
      error: () => {
        this.advancing = false;
        this.toast.error('Unable to update activity status.');
      }
    });
  }

  // ─── QR scan modal ─────────────────────────────────────────────────────────

  closeQrScanModal(): void {
    this.isQrScanOpen = false;
    this.qrScanContext = null;
  }

  onQrMatched(event: { id: string; next: OrderActivityStatus }): void {
    this.closeQrScanModal();
    this.applyActivityStatus(event.next);
  }

  // ─── Proof-of-delivery modal ────────────────────────────────────────────────

  closePodModal(): void {
    this.isPodOpen = false;
    this.podContext = null;
  }

  onPodDelivered(event: { id: string; next: OrderActivityStatus }): void {
    this.closePodModal();
    this.applyActivityStatus(event.next);
  }

  // ─── Report incident modal ─────────────────────────────────────────────────

  openReportModal(): void {
    if (!this.order || !this.incidentStage) return;
    if (this.hasIncidentReport) {
      this.toast.warning('Issue already reported.');
      return;
    }
    this.reportContext = { id: this.order.id, stage: this.incidentStage, orderNo: this.order.full.orderNumber };
    this.isReportOpen = true;
  }

  closeReportModal(): void {
    this.isReportOpen = false;
    this.reportContext = null;
  }

  onReportSubmitted(): void {
    this.loadOrder();
  }
}
