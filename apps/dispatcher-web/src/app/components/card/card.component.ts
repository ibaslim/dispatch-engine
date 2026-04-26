import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card',
  imports: [CommonModule],
  templateUrl: './card.component.html'
})
export class CardComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() icon: string = '';
  @Input() active = false;
}