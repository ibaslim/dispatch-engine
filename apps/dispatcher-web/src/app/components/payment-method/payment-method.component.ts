import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BaseInputComponent } from '../base-input/base-input.component';
import { DropdownSelectorComponent } from '../dropdown-selector/dropdown-selector.component';
import { SelectOption } from '../../models/dropdown-selector/dropdown-selector.model';
import { PaymentDetails, PaymentMethodType } from '../../models/new-order-form/new-order-form.model';

@Component({
  selector: 'app-payment-method',
  standalone: true,
  imports: [CommonModule, BaseInputComponent, DropdownSelectorComponent],
  templateUrl: './payment-method.component.html'
})
export class PaymentMethodComponent {
  @Input() required = false;

  @Input() value: PaymentDetails = { method: 'cash_on_delivery' };
  @Output() valueChange = new EventEmitter<PaymentDetails>();

  paymentOptions: Array<SelectOption<PaymentMethodType>> = [
    { label: 'Cash on delivery', value: 'cash_on_delivery' },
    { label: 'Credit card', value: 'credit_card' }
  ];

  setMethod(method: PaymentMethodType | ''): void {
    // dropdown placeholder emits '' (disabled) in some cases, so ignore it safely
    if (method === '') return;

    if (method === 'cash_on_delivery') {
      this.valueChange.emit({ method });
      return;
    }

    const cc = this.value.creditCard ?? {
      cardholderName: '',
      cardNumber: '',
      expiryMonth: '',
      expiryYear: '',
      cvc: ''
    };

    this.valueChange.emit({ method, creditCard: cc });
  }

  patchCreditCard(p: Partial<NonNullable<PaymentDetails['creditCard']>>): void {
    const next: PaymentDetails = {
      method: 'credit_card',
      creditCard: {
        cardholderName: '',
        cardNumber: '',
        expiryMonth: '',
        expiryYear: '',
        cvc: '',
        ...(this.value.creditCard ?? {}),
        ...p
      }
    };

    this.valueChange.emit(next);
  }
}