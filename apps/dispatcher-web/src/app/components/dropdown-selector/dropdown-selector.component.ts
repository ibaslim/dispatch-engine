import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SelectOption } from '../../models/dropdown-selector/dropdown-selector.model';

@Component({
  selector: 'app-dropdown-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dropdown-selector.component.html'
})
export class DropdownSelectorComponent<T extends string = string> {
  @Input() label = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() name = '';

  @Input() placeholder = 'Select an option';
  @Input() options: Array<SelectOption<T>> = [];

  @Input() value: T | '' = '';
  @Output() valueChange = new EventEmitter<T | ''>();

  // NEW: compact mode & custom classes
  @Input() showLabel = true;
  @Input() dense = false;
  @Input() selectClass = '';

  onChange(e: Event): void {
    this.valueChange.emit((e.target as HTMLSelectElement).value as T | '');
  }
}