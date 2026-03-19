import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';

import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TrackingResponse } from '@dispatch/shared/contracts';

@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-4">
          <h1 class="text-xl font-semibold text-gray-900">Track Your Delivery</h1>
        </div>
      </header>

      <main class="max-w-2xl mx-auto px-4 py-8">
        @if (isLoading()) {
          <div class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        } @else if (errorMessage()) {
          <div class="rounded-md bg-red-50 p-6 text-center">
            <p class="text-red-800 font-medium">{{ errorMessage() }}</p>
            <p class="text-red-600 text-sm mt-2">
              This tracking link may be invalid or expired.
            </p>
          </div>
        } @else if (tracking()) {
          <div class="bg-white rounded-xl shadow-md p-6 space-y-6">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500">Order status</span>
              <span
                class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                [class]="statusClass()"
              >
                {{ statusLabel() }}
              </span>
            </div>

            @if (tracking()?.driver_name) {
              <div>
                <p class="text-sm text-gray-500">Driver</p>
                <p class="font-medium text-gray-900">{{ tracking()?.driver_name }}</p>
              </div>
            }

            @if (tracking()?.estimated_arrival) {
              <div>
                <p class="text-sm text-gray-500">Estimated arrival</p>
                <p class="font-medium text-gray-900">{{ tracking()?.estimated_arrival }}</p>
              </div>
            }

            <div class="border rounded-lg bg-gray-100 h-48 flex items-center justify-center text-gray-400">
              <p class="text-sm">Map placeholder &ndash; integrate Google Maps</p>
            </div>
          </div>
        }
      </main>
    </div>
  `,
})
export class TrackingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  tracking = signal<TrackingResponse | null>(null);
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.errorMessage.set('Invalid tracking link.');
      this.isLoading.set(false);
      return;
    }
    this.loadTracking(token);
    this.pollInterval = setInterval(() => this.loadTracking(token), 30_000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async loadTracking(token: string): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<TrackingResponse>(`/api/v1/tracking/${token}`)
      );
      this.tracking.set(data);
    } catch {
      this.errorMessage.set('Could not load tracking information.');
    } finally {
      this.isLoading.set(false);
    }
  }

  statusLabel(): string {
    const s = this.tracking()?.status ?? '';
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  statusClass(): string {
    const s = this.tracking()?.status ?? '';
    switch (s) {
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'in_transit': return 'bg-blue-100 text-blue-800';
      case 'picked_up': return 'bg-indigo-100 text-indigo-800';
      case 'assigned': return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}
