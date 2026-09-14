import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent } from '@components/button/button.component';
import { LocationError, LocationPermissionService } from '@core/location/location-permission.service';
import { ToastService } from '@core/toast/toast.service';

const DISMISS_KEY = 'dispatch.location_banner_dismissed';

@Component({
  selector: 'app-location-permission-banner',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './location-permission-banner.component.html',
})
export class LocationPermissionBannerComponent {
  readonly location = inject(LocationPermissionService);
  private readonly toast = inject(ToastService);

  readonly requesting = signal(false);
  // Dismissal lasts for the tab session only; drivers need location, so it returns next visit.
  readonly dismissed = signal(readDismissed());

  readonly visible = computed(() => {
    const status = this.location.status();
    return !this.dismissed() && status !== 'granted' && status !== 'unknown';
  });

  readonly canAsk = computed(() => this.location.status() === 'prompt');

  readonly message = computed(() => this.location.explain(this.location.status()));

  async allow(): Promise<void> {
    this.requesting.set(true);
    try {
      await this.location.request();
      this.toast.success('Location allowed.');
    } catch (err) {
      if (err instanceof LocationError && err.status !== 'denied') {
        this.toast.error(err.message);
      }
    } finally {
      this.requesting.set(false);
    }
  }

  async recheck(): Promise<void> {
    const status = await this.location.refresh();
    if (status === 'granted') this.toast.success('Location allowed.');
  }

  dismiss(): void {
    this.dismissed.set(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage blocked; dismissal still holds until reload.
    }
  }
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
