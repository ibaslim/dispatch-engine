import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { OrdersService } from '@services/orders/orders.service';
import { ToastService } from '@core/toast/toast.service';

export interface ReportIncidentContext {
  id: string;
  stage: 'pickup' | 'delivery';
  orderNo: string | null;
}

// Reasons that always require a description, regardless of stage.
const INCIDENT_REASONS_REQUIRING_DESCRIPTION = new Set(['other', 'parcel_issue']);

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

@Component({
  selector: 'app-report-incident-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent, ButtonComponent],
  templateUrl: './report-incident-modal.component.html'
})
export class ReportIncidentModalComponent implements OnChanges {
  @Input() open = false;
  @Input() context: ReportIncidentContext | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  reportReason = '';
  reportDescription = '';
  reportSubmitting = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly toast: ToastService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['context'] && this.context) {
      this.reportReason = '';
      this.reportDescription = '';
      this.reportSubmitting = false;
    }
  }

  get reportReasonOptions(): { value: string; label: string }[] {
    const stage = this.context?.stage;
    return stage ? INCIDENT_REASONS_BY_STAGE[stage] : [];
  }

  get reportDescriptionRequired(): boolean {
    return INCIDENT_REASONS_REQUIRING_DESCRIPTION.has(this.reportReason);
  }

  onClose(): void {
    this.reportReason = '';
    this.reportDescription = '';
    this.reportSubmitting = false;
    this.close.emit();
  }

  submitReport(): void {
    if (!this.context || !this.reportReason || this.reportSubmitting) return;

    const description = this.reportDescription.trim();
    if (this.reportDescriptionRequired && !description) {
      this.toast.error('Please describe what happened.');
      return;
    }

    this.reportSubmitting = true;

    this.ordersService.reportIncident(
      this.context.id,
      this.context.stage,
      this.reportReason,
      description || null
    ).subscribe({
      next: () => {
        this.reportSubmitting = false;
        this.toast.success('Issue reported.');
        this.submitted.emit();
        this.onClose();
      },
      error: () => {
        this.reportSubmitting = false;
        this.toast.error('Failed to submit report. Please try again.');
      }
    });
  }
}
