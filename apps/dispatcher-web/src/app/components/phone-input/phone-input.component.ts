import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PhoneValue } from '../../models/phone-input/phone-input.model';
import { ErrorMessageComponent } from '../error-message/error-message.component';

@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ErrorMessageComponent],
  templateUrl: './phone-input.component.html'
})
export class PhoneInputComponent {
  @Input() label = 'Phone No.';
  @Input() required = false;

  @Input() value: PhoneValue = { countryCode: '+1', number: '' };
  @Output() valueChange = new EventEmitter<PhoneValue>();

  onCountryCode(v: string): void {
    this.valueChange.emit({ ...this.value, countryCode: v });
  }

  onNumber(v: string): void {
    this.valueChange.emit({ ...this.value, number: v });
  }
}