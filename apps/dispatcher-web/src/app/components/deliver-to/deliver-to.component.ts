import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { CommonModule } from '@angular/common';
import { BaseInputComponent } from '../base-input/base-input.component';
import { AddressInputComponent } from '../address-input/address-input.component';
import { PhoneInputComponent } from '../phone-input/phone-input.component';

@Component({
  selector: 'app-deliver-to',
  imports: [CommonModule, BaseInputComponent, AddressInputComponent, PhoneInputComponent],
  templateUrl: './deliver-to.component.html'
})
export class DeliverToComponent {
  @Input() value!: NewOrderFormValue['delivery'];
  @Output() valueChange = new EventEmitter<NewOrderFormValue['delivery']>();

  @Output() pinClick = new EventEmitter<void>();

  patch(p: Partial<NewOrderFormValue['delivery']>): void {
    this.valueChange.emit({ ...this.value, ...p });
  }
}