import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BaseInputComponent } from '../base-input/base-input.component';

@Component({
  selector: 'app-time-picker',
  standalone: true,
  imports: [CommonModule, BaseInputComponent],
  templateUrl: './time-picker.component.html'
})
export class TimePickerComponent {
  @Input() label = 'Time';
  @Input() required = false;
  @Input() name = '';
  @Input() value = ''; // HH:mm
  @Input() externalError = '';
  @Input() showExternalError = false;
  @Input() showSubmitValidation = false;
  
  @Output() valueChange = new EventEmitter<string>();
}