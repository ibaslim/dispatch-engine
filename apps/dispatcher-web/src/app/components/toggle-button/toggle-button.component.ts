import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-toggle-button',
  imports: [CommonModule, ButtonComponent],
  templateUrl: './toggle-button.component.html'
})
export class ToggleButtonComponent {
  @Input() value = false;
  @Output() valueChange = new EventEmitter<boolean>();

  toggle(): void {
    this.valueChange.emit(!this.value);
  }
}