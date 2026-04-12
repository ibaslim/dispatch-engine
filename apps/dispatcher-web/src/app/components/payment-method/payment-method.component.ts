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
  @Input() showSubmitValidation = false;

  @Input() value: PaymentDetails = { method: 'cash_on_delivery' };
  @Output() valueChange = new EventEmitter<PaymentDetails>();

  paymentOptions: Array<SelectOption<PaymentMethodType>> = [
    { label: 'Cash on delivery', value: 'cash_on_delivery' },
    { label: 'Credit card', value: 'credit_card' }
  ];

  namePattern = "^[a-zA-Z\\s]+$";

  cardNumberPattern = "^\\d{16}$";

  monthPattern = "^(0[1-9]|1[0-2])$";
  yearPattern = "^\\d{4}$";
  cvcPattern = "^\\d{3}$";

  cardholderErrorMessages = {
    required: 'Cardholder name is required.',
    pattern: 'Only letters and spaces are allowed.'
  };

  cardNumberErrorMessages = {
    required: 'Card number is required.',
    pattern: 'Card number must contain only numbers and be exactly 16 digits.'
  };

  monthErrorMessages = {
    required: 'Expiry month is required.',
    pattern: 'Month must be in format 01–12.'
  };

  yearErrorMessages = {
    required: 'Expiry year is required.',
    pattern: 'Year must be exactly 4 digits.'
  };

  cvcErrorMessages = {
    required: 'CVC is required.',
    pattern: 'CVC must be exactly 3 digits.'
  };

  setMethod(method: PaymentMethodType | ''): void {
    if (!method) return;

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

    this.valueChange.emit({
      method,
      creditCard: cc
    });
  }

  patchCreditCard(p: Partial<NonNullable<PaymentDetails['creditCard']>>): void {
    this.valueChange.emit({
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
    });
  }
}