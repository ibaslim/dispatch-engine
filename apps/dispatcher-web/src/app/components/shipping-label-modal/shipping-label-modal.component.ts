import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { OrderEntity } from '@models/orders/order-entity.model';
import { OrderDocumentService } from '@services/orders/order-document.service';
import { ToastService } from '@core/toast/toast.service';

@Component({
  selector: 'app-shipping-label-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent, ButtonComponent],
  templateUrl: './shipping-label-modal.component.html'
})
export class ShippingLabelModalComponent implements OnChanges {
  @Input() open = false;
  @Input() order: OrderEntity | null = null;
  @Output() close = new EventEmitter<void>();

  constructor(
    private readonly orderDocumentService: OrderDocumentService,
    private readonly toast: ToastService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order'] && this.order) {
      queueMicrotask(() => {
        void this.orderDocumentService.renderLabelGraphics(this.order?.full.orderNumber ?? '');
      });
    }
  }

  onClose(): void {
    this.close.emit();
  }

  printLabel(): void {
    if (!this.order) return;
    if (!this.orderDocumentService.printLabel(this.order)) {
      this.toast.error('Popup blocked. Allow popups to print the label.');
    }
  }

  async downloadLabelPdf(): Promise<void> {
    if (!this.order) return;
    try {
      await this.orderDocumentService.downloadLabelPdf(this.order.full.orderNumber ?? '');
    } catch {
      this.toast.error('Failed to download label PDF.');
    }
  }
}
