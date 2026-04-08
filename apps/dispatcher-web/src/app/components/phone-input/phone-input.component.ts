import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PhoneValue } from '../../models/phone-input/phone-input.model';

@Component({
  selector: 'app-phone-input',
  imports: [CommonModule],
  templateUrl: './phone-input.component.html'
})
export class PhoneInputComponent {
  @Input() label = 'Phone No.';
  @Input() required = false;

  @Input() value: PhoneValue = { countryCode: '+1', number: '' };
  @Output() valueChange = new EventEmitter<PhoneValue>();

  onCountryCode(e: Event): void {
    this.valueChange.emit({ ...this.value, countryCode: (e.target as HTMLInputElement).value });
  }

  onNumber(e: Event): void {
    this.valueChange.emit({ ...this.value, number: (e.target as HTMLInputElement).value });
  }
}