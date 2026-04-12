import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { ErrorMessageComponent } from '../error-message/error-message.component';

@Component({
  selector: 'app-textarea',
  standalone: true,
  imports: [CommonModule, FormsModule, ErrorMessageComponent],
  templateUrl: './textarea.component.html'
})
export class TextareaComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() value = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() name = '';
  @Input() pattern?: string;

  @Input() errorMessages: { [key: string]: string } = {};

  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('model', { static: true }) model?: NgModel;

  onInput(v: string): void {
    this.valueChange.emit(v);
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'textarea';
  }

  get showError(): boolean {
    const m = this.model;
    return !!(m && m.invalid && (m.touched || m.dirty));
  }

  get errorList(): string[] {
    const m = this.model;
    if (!m || !m.errors) return [];
    return [
      m.errors['required'] ? (this.errorMessages['required'] || 'This field is required.') : '',
      m.errors['pattern'] ? (this.errorMessages['pattern'] || 'Invalid format.') : ''
    ].filter(Boolean);
  }
}