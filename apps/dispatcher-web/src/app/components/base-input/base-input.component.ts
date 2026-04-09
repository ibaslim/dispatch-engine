import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ErrorMessageComponent } from '../error-message/error-message.component';

@Component({
  selector: 'app-base-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ErrorMessageComponent],
  templateUrl: './base-input.component.html'
})
export class BaseInputComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() value: string | number = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() showLabel = true;

  @Input() type: 'text' | 'number' | 'email' | 'date' | 'time' = 'text';
  @Input() hasSuffix = false;

  @Input() name = '';
  @Input() pattern?: string;
  @Input() min?: number;
  @Input() max?: number;
  @Input() step?: number;

  @Input() errorMessages: { [key: string]: string } = {};

  @Output() valueChange = new EventEmitter<string>();

  onInputValue(v: string): void {
    this.valueChange.emit(v);
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'field';
  }
}