import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PhoneValue } from '../../models/phone-input/phone-input.model';
import { ErrorMessageComponent } from '../error-message/error-message.component';
import { DropdownSelectorComponent } from '../dropdown-selector/dropdown-selector.component';
import { PHONE_COUNTRIES, PhoneCountry } from '../../models/phone-countries/phone-countries.model';

@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ErrorMessageComponent, DropdownSelectorComponent],
  templateUrl: './phone-input.component.html'
})
export class PhoneInputComponent implements OnChanges {
  @Input() label = 'Phone No.';
  @Input() required = false;
  @Input() value: PhoneValue = { countryCode: '+1', number: '' };
  @Input() countries: PhoneCountry[] = PHONE_COUNTRIES;
  @Input() errorMessages: {
    required?: string;
    onlyNumbers?: string;
    length?: string;
  } = {};
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<PhoneValue>();

  private interacted = false;
  private invalidChars = false;

  ngOnChanges(): void {
    if (!this.showSubmitValidation) {
      this.interacted = false;
      this.invalidChars = false;
    }
  }

  get countryOptions() {
    return this.countries.map(c => ({
      value: c.dialCode,
      label: `${c.flag} ${c.dialCode}`
    }));
  }

  onCountryCode(v: string): void {
    this.interacted = true;

    this.valueChange.emit({
      ...this.value,
      countryCode: v
    });
  }

  onNumber(v: string): void {
    this.interacted = true;

    // detect invalid characters
    this.invalidChars = /\D/.test(v);

    // allow only digits
    let digitsOnly = v.replace(/\D/g, '');

    // limit to 10 digits
    if (digitsOnly.length > 10) {
      digitsOnly = digitsOnly.slice(0, 10);
    }

    this.valueChange.emit({
      ...this.value,
      number: digitsOnly
    });
  }

  isInvalidLength(): boolean {
    const n = this.value.number;
    if (!n) return false;
    return n.length !== 10;
  }

  get showNumberError(): boolean {
    if (!this.interacted && !this.showSubmitValidation) return false;

    if (this.invalidChars) return true;

    return this.required && !this.value.number || this.isInvalidLength();
  }

  get numberErrors(): string[] {
    const list: string[] = [];

    if (!this.interacted && !this.showSubmitValidation) return list;

    // ONLY NUMBERS ERROR (highest priority)
    if (this.invalidChars) {
      list.push(this.errorMessages.onlyNumbers || 'Only numbers are allowed.');
      return list;
    }

    // REQUIRED ERROR
    if (this.required && !this.value.number) {
      list.push(this.errorMessages.required || 'Phone number is required.');
    }

    // LENGTH ERROR
    if (this.value.number && this.value.number.length !== 10) {
      list.push(this.errorMessages.length || 'Phone number must be exactly 10 digits.');
    }

    return list;
  }
}