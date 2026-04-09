import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-error-message',
  imports: [CommonModule],
  templateUrl: './error-message.component.html'
})
export class ErrorMessageComponent {
  @Input() show = false;
  @Input() messages: string[] = [];
}