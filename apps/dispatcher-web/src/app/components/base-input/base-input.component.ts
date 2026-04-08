import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-base-input',
  imports: [CommonModule],
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

  @Output() valueChange = new EventEmitter<string>();

  onInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.valueChange.emit(v);
  }
}