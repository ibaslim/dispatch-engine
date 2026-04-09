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
  @Output() valueChange = new EventEmitter<string>();
}