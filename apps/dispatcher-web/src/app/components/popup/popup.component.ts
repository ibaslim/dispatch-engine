import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-popup',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './popup.component.html'
})
export class PopupComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() widthClass = 'max-w-5xl'; // allow reuse in other pages

  @Output() close = new EventEmitter<void>();

  onBackdropClick(): void {
    this.close.emit();
  }
}
