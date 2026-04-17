import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { CommonModule } from '@angular/common';
import { BaseInputComponent } from '../base-input/base-input.component';
import { AddressInputComponent } from '../address-input/address-input.component';
import { PhoneInputComponent } from '../phone-input/phone-input.component';
import { TimePickerComponent } from '../time-picker/time-picker.component';
import { DatePickerComponent } from '../date-picker/date-picker.component';

@Component({
  selector: 'app-deliver-to',
  imports: [CommonModule, BaseInputComponent, AddressInputComponent, PhoneInputComponent, TimePickerComponent, DatePickerComponent],
  templateUrl: './deliver-to.component.html'
})
export class DeliverToComponent {
  @Input() value!: NewOrderFormValue['delivery'];
  @Input() deliveryTimeError = '';
  @Input() showDeliveryTimeError = false;
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<NewOrderFormValue['delivery']>();
  @Output() pinClick = new EventEmitter<void>();

  patch(p: Partial<NewOrderFormValue['delivery']>): void {
    this.valueChange.emit({ ...this.value, ...p });
  }
}