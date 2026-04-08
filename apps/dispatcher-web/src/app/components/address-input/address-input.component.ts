import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-address-input',
  imports: [CommonModule, ButtonComponent],
  templateUrl: './address-input.component.html',
})
export class AddressInputComponent {
  @Input() label = 'Address';
  @Input() placeholder = 'Enter a location';
  @Input() value = '';
  @Input() required = false;

  @Output() valueChange = new EventEmitter<string>();
  @Output() pinClick = new EventEmitter<void>();

  onInput(e: Event): void {
    this.valueChange.emit((e.target as HTMLInputElement).value);
  }
}
