import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { CommonModule } from '@angular/common';
import { BaseInputComponent } from '../base-input/base-input.component';
import { AddressInputComponent } from '../address-input/address-input.component';
import { PhoneInputComponent } from '../phone-input/phone-input.component';

@Component({
  selector: 'app-pickup-from',
  imports: [CommonModule, BaseInputComponent, AddressInputComponent, PhoneInputComponent],
  templateUrl: './pickup-from.component.html'
})
export class PickupFromComponent {
  @Input() value!: NewOrderFormValue['pickup'];
  @Output() valueChange = new EventEmitter<NewOrderFormValue['pickup']>();

  @Output() pinClick = new EventEmitter<void>();

  patch(p: Partial<NewOrderFormValue['pickup']>): void {
    this.valueChange.emit({ ...this.value, ...p });
  }
}