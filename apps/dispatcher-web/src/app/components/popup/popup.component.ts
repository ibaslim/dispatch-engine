import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-popup',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './popup.component.html'
})
export class PopupComponent implements OnChanges {
  @Input() open = false;
  @Input() title = '';
  @Input() widthClass = 'max-w-5xl';
  @Output() close = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  onBackdropClick(): void {
    this.close.emit();
  }
}