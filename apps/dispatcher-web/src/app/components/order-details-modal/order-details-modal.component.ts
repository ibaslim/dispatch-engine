import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PopupComponent } from '@components/popup/popup.component';
import { ToggleButtonComponent } from '@components/toggle-button/toggle-button.component';
import { OrderEntity } from '@models/orders/order-entity.model';
import { driverEarningsLabel, formatPaymentMethod, maskCard } from '@pages/orders/orders-formatting.util';

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
export class OrderDetailsModalComponent {
  @Input() open = false;
  @Input() order: OrderEntity | null = null;
  @Input() isReadOnlyTenant = false;
  @Input() readyForPickup = false;
  @Output() close = new EventEmitter<void>();
  @Output() menuAction = new EventEmitter<string>();
  @Output() readyForPickupChange = new EventEmitter<boolean>();

  isDetailsMenuOpen = false;

  protected readonly maskCard = maskCard;
  protected readonly formatPaymentMethod = formatPaymentMethod;
  protected readonly driverEarningsLabel = driverEarningsLabel;

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
