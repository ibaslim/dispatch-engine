import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { OrdersService } from '@services/orders/orders.service';
import { ToastService } from '@core/toast/toast.service';
import { INCIDENT_REASONS_BY_STAGE } from '@pages/orders/activity-flow.util';
import { INCIDENT_REASONS_REQUIRING_DESCRIPTION, type IncidentReason } from '@dispatch/shared/contracts';

export interface ReportIncidentContext {
  id: string;
  stage: 'pickup' | 'delivery';
  orderNo: string | null;
}

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
    return INCIDENT_REASONS_REQUIRING_DESCRIPTION.includes(this.reportReason as IncidentReason);
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
