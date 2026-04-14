import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { BaseInputComponent } from '../base-input/base-input.component';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, ButtonComponent, BaseInputComponent],
  templateUrl: './date-picker.component.html'
})
export class DatePickerComponent {
  @Input() label = 'Date';
  @Input() required = false;
  @Input() value = ''; // YYYY-MM-DD  
  @Input() placeholder = 'YYYY-MM-DD';
  @Input() name = '';
  @Input() minDate?: string;
  @Input() errorMessages: { [key: string]: string } = {};
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<string>();

  get effectiveMinDate(): string {
    if (this.minDate) return this.minDate;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}