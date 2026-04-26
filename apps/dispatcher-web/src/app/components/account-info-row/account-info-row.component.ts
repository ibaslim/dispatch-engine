import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-account-info-row',
  imports: [CommonModule, ButtonComponent],
  templateUrl: './account-info-row.component.html'
})
export class AccountInfoRowComponent {
  @Input() label = '';
  @Input() value?: string;
  @Input() actionLabel?: string;
  @Input() bordered = true;

  @Output() actionClick = new EventEmitter<void>();
}
