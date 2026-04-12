import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';

@Component({
  selector: 'app-address-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, ErrorMessageComponent],
  templateUrl: './address-input.component.html',
})
export class AddressInputComponent {
  @Input() label = 'Address';
  @Input() placeholder = 'Enter a location';
  @Input() value = '';
  @Input() required = false;
  @Input() name = '';
  @Input() pattern?: string;

  @Input() errorMessages: Partial<Record<'required' | 'pattern', string>> = {};

  @Output() valueChange = new EventEmitter<string>();
  @Output() pinClick = new EventEmitter<void>();

  @ViewChild('model', { static: true }) model?: NgModel;

  onInput(v: string): void {
    this.valueChange.emit(v);
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'address';
  }

  get showError(): boolean {
    const m = this.model;
    return !!(m && m.invalid && (m.touched || m.dirty));
  }

  get errorList(): string[] {
    const m = this.model;
    if (!m || !m.errors) return [];

    return [
      m.errors['required'] ? (this.errorMessages.required || 'Address is required.') : '',
      m.errors['pattern'] ? (this.errorMessages.pattern || 'Invalid address format.') : ''
    ].filter(Boolean);
  }
}