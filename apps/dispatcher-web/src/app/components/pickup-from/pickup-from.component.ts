import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { AddressInputComponent } from '../address-input/address-input.component';
import { BaseInputComponent } from '../base-input/base-input.component';
import { PhoneInputComponent } from '../phone-input/phone-input.component';
import { TimePickerComponent } from '../time-picker/time-picker.component';

@Component({
  selector: 'app-pickup-from',
  standalone: true,
  imports: [CommonModule, BaseInputComponent, AddressInputComponent, PhoneInputComponent, TimePickerComponent],
  templateUrl: './pickup-from.component.html'
})
export class PickupFromComponent {
  @Input() value!: NewOrderFormValue['pickup'];
  @Input() pickupTimeError = '';
  @Input() showPickupTimeError = false;
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<NewOrderFormValue['pickup']>();
  @Output() pinClick = new EventEmitter<void>();

  patch(p: Partial<NewOrderFormValue['pickup']>): void {
    this.valueChange.emit({ ...this.value, ...p });
  }
}