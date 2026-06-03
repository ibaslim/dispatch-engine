import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <div
        *ngFor="let toast of toastService.toasts()"
        class="flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg"
        [ngClass]="getToastClasses(toast.type)"
      >
        <span class="mt-0.5 text-base" [ngClass]="getIconClass(toast.type)">
          <i class="ph" [ngClass]="getIconName(toast.type)"></i>
        </span>
        <p class="text-sm font-medium leading-5">
          {{ toast.message }}
        </p>
        <button
          type="button"
          class="ml-auto text-xs text-gray-500 hover:text-gray-700"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Dismiss toast"
        >
          <i class="ph ph-x"></i>
        </button>
      </div>
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  getToastClasses(type: 'success' | 'error' | 'warning'): string {
    const map: Record<'success' | 'error' | 'warning', string> = {
      success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      error: 'bg-red-50 text-red-900 border-red-200',
      warning: 'bg-amber-50 text-amber-900 border-amber-200',
    };
    return map[type];
  }

  getIconName(type: 'success' | 'error' | 'warning'): string {
    const map: Record<'success' | 'error' | 'warning', string> = {
      success: 'ph-check-circle',
      error: 'ph-warning-circle',
      warning: 'ph-warning',
    };
    return map[type];
  }

  getIconClass(type: 'success' | 'error' | 'warning'): string {
    const map: Record<'success' | 'error' | 'warning', string> = {
      success: 'text-emerald-600',
      error: 'text-red-600',
      warning: 'text-amber-600',
    };
    return map[type];
  }
}

