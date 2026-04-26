import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-error-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-message.component.html'
})
export class ErrorMessageComponent {
  @Input() show = false;
  @Input() messages: string[] = [];

  get uniqueMessages(): string[] {
    return Array.from(new Set(this.messages.filter(Boolean)));
  }
}
