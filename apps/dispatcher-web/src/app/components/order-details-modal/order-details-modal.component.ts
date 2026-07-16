import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { PopupComponent } from '@components/popup/popup.component';
import { ToggleButtonComponent } from '@components/toggle-button/toggle-button.component';
import { OrderEntity } from '@models/orders/order-entity.model';
import { driverEarningsLabel, formatPaymentMethod, maskCard } from '@pages/orders/orders-formatting.util';
import { OrdersService } from '@services/orders/orders.service';

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
  selector: 'app-order-details-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent, ToggleButtonComponent],
  templateUrl: './order-details-modal.component.html'
})
export class OrderDetailsModalComponent implements OnChanges {
  @Input() open = false;
  @Input() order: OrderEntity | null = null;
  @Input() isReadOnlyTenant = false;
  @Input() readyForPickup = false;
  @Output() close = new EventEmitter<void>();
  @Output() menuAction = new EventEmitter<string>();
  @Output() readyForPickupChange = new EventEmitter<boolean>();

  isDetailsMenuOpen = false;

  // Captured POD images, loaded lazily when the modal opens (data URLs for <img> binding).
  podSignatureUrl: string | null = null;
  podPhotoUrl: string | null = null;
  podLoadError = false;
  private podLoadedOrderId: string | null = null;

  protected readonly maskCard = maskCard;
  protected readonly formatPaymentMethod = formatPaymentMethod;
  protected readonly driverEarningsLabel = driverEarningsLabel;

  constructor(private ordersService: OrdersService) {}

  ngOnChanges(): void {
    const order = this.open ? this.order : null;
    const submission = order?.full.details.podSubmission;
    const targetId = order && submission ? order.id : null;

    if (targetId === this.podLoadedOrderId) return;

    this.podLoadedOrderId = targetId;
    this.podSignatureUrl = null;
    this.podPhotoUrl = null;
    this.podLoadError = false;

    if (!order || !submission) return;
    if (submission.hasSignature) {
      this.fetchPodImage(order.id, 'signature', (url) => (this.podSignatureUrl = url));
    }
    if (submission.hasPhoto) {
      this.fetchPodImage(order.id, 'photo', (url) => (this.podPhotoUrl = url));
    }
  }

  private fetchPodImage(orderId: string, kind: 'photo' | 'signature', assign: (url: string) => void): void {
    this.ordersService.getProofOfDeliveryImage(orderId, kind).subscribe({
      next: (blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Ignore late responses if the modal moved on to another order.
          if (this.podLoadedOrderId === orderId) assign(reader.result as string);
        };
        reader.readAsDataURL(blob);
      },
      error: () => {
        if (this.podLoadedOrderId === orderId) this.podLoadError = true;
      }
    });
  }

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

  onClose(): void {
    this.isDetailsMenuOpen = false;
    this.close.emit();
  }

  onMenuAction(action: string): void {
    this.isDetailsMenuOpen = false;
    this.menuAction.emit(action);
  }

  incidentReasonLabel(reason: string): string {
    return INCIDENT_REASON_LABELS[reason] ?? reason;
  }
}
