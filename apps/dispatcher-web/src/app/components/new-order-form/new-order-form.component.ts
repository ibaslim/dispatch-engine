import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, Signal } from '@angular/core';
import { BaseInputComponent } from '../base-input/base-input.component';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { PickupFromComponent } from '../pickup-from/pickup-from.component';
import { DeliverToComponent } from '../deliver-to/deliver-to.component';
import { OtherOrderDetailsComponent } from '../other-order-details/other-order-details.component';

@Component({
  selector: 'app-new-order-form',
  standalone: true,
  imports: [
    CommonModule,
    BaseInputComponent,
    PickupFromComponent,
    DeliverToComponent,
    OtherOrderDetailsComponent
  ],
  templateUrl: './new-order-form.component.html'
})
export class NewOrderFormComponent {
  @Input() value: NewOrderFormValue = this.createDefaultValue();
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<NewOrderFormValue>();
  @Output() pinPickup = new EventEmitter<void>();
  @Output() pinDelivery = new EventEmitter<void>();

  private todayYYYYMMDD(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  createDefaultValue(): NewOrderFormValue {
    return {
      orderNumber: '',
      pickup: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        address: '',
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
        items: [
          {
            itemName: '',
            itemPrice: 0,
            itemQty: 0
          }
        ],
        taxRate: 0,
        deliveryFees: 0,
        deliveryTips: 0,
        discount: 0,
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        instructions: '',
        payment: {
          method: 'cash_on_delivery'
        }
      }
    };
  }

  patch(partial: Partial<NewOrderFormValue>): void {
    this.valueChange.emit({ ...this.value, ...partial });
  }

  private toMinutes(t: string): number {
    const [hh, mm] = t.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
    return hh * 60 + mm;
  }

  private get pickupTime(): string {
    return this.value.pickup?.pickupTime || '';
  }

  private get deliveryTime(): string {
    return this.value.delivery?.deliveryTime || '';
  }

  get showDeliveryTimeError(): boolean {
    if (!this.pickupTime || !this.deliveryTime) return false;
    return this.isDeliveryBeforeOrEqualPickup;
  }

  get deliveryTimeError(): string {
    return this.showDeliveryTimeError ? 'Delivery time must be after pickup time.' : '';
  }

  private get isDeliveryBeforeOrEqualPickup(): boolean {
    const p = this.toMinutes(this.pickupTime);
    const d = this.toMinutes(this.deliveryTime);
    if (Number.isNaN(p) || Number.isNaN(d)) return false;
    return d <= p;
  }
}