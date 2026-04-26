import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page.component.html',
})
export class PageComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() containerClass = 'w-full px-4 py-8 sm:px-6 lg:px-8';
  @Input() contentClass = 'w-full space-y-6';
  @Input() headerClass = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2';
  @Input() titleClass = 'text-2xl sm:text-xl font-bold text-gray-900 dark:text-gray-100';
  @Input() subtitleClass = 'text-sm sm:text-xs text-gray-500 dark:text-gray-400';
}
