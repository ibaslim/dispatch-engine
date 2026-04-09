import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

  @Output() valueChange = new EventEmitter<string>();

  onInput(v: string): void {
    this.valueChange.emit(v);
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'textarea';
  }
}