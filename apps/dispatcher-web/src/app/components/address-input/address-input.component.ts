import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

  @Output() valueChange = new EventEmitter<string>();
  @Output() pinClick = new EventEmitter<void>();

  onInput(v: string): void {
    this.valueChange.emit(v);
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'address';
  }
}