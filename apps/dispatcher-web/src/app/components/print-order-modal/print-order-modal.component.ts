import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { OrderEntity } from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { OrderDocumentService } from '@services/orders/order-document.service';
import { ToastService } from '@core/toast/toast.service';
import { formatPaymentMethod, formatStatusLabel, maskCard, money, toNumber } from '@pages/orders/orders-formatting.util';

@Component({
  selector: 'app-print-order-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent, ButtonComponent],
  templateUrl: './print-order-modal.component.html'
})
export class PrintOrderModalComponent {
  @Input() open = false;
  @Input() order: OrderEntity | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() emailSent = new EventEmitter<void>();

  isSendingOrderEmail = false;

  protected readonly money = money;
  protected readonly toNumber = toNumber;
  protected readonly maskCard = maskCard;
  protected readonly formatPaymentMethod = formatPaymentMethod;
  protected readonly formatStatusLabel = formatStatusLabel;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderDocumentService: OrderDocumentService,
    private readonly toast: ToastService
  ) { }

  onClose(): void {
    this.isSendingOrderEmail = false;
    this.close.emit();
  }

  async sendSelectedOrderByEmail(): Promise<void> {
    const order = this.order;
    if (!order || this.isSendingOrderEmail) return;

    const pickupEmail = order.full.pickup.email.trim();
    if (!pickupEmail) {
      this.toast.error('This order does not have a sender email address.');
      return;
    }

    this.isSendingOrderEmail = true;
    try {
      await firstValueFrom(this.ordersService.sendSenderInvoice(order.id));
      this.toast.success(`Invoice emailed to ${pickupEmail}.`);
      this.emailSent.emit();
    } catch (error: any) {
      this.toast.error(error?.error?.detail || 'Unable to send invoice email.');
    } finally {
      this.isSendingOrderEmail = false;
    }
  }

  printOrder(): void {
    if (!this.order) return;
    if (!this.orderDocumentService.openPrintWindow(this.order)) {
      this.toast.error('Popup blocked. Allow popups to print the order.');
    }
  }
}
