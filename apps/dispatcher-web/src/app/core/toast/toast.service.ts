import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(type: ToastType, message: string, durationMs = 4000): void {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast: ToastMessage = { id, type, message, durationMs };
    this._toasts.update((items) => [...items, toast]);

    setTimeout(() => {
      this.dismiss(id);
    }, durationMs);
  }

  success(message: string, durationMs?: number): void {
    this.show('success', message, durationMs);
  }

  error(message: string, durationMs?: number): void {
    this.show('error', message, durationMs);
  }

  warning(message: string, durationMs?: number): void {
    this.show('warning', message, durationMs);
  }

  dismiss(id: string): void {
    this._toasts.update((items) => items.filter((item) => item.id !== id));
  }
}

