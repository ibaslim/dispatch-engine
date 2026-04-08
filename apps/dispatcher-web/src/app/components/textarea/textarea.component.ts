import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-textarea',
  imports: [CommonModule],
  templateUrl: './textarea.component.html'
})
export class TextareaComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() value = '';
  @Input() required = false;
  @Input() disabled = false;

  @Output() valueChange = new EventEmitter<string>();

  onInput(e: Event): void {
    const v = (e.target as HTMLTextAreaElement).value;
    this.valueChange.emit(v);
  }
}