import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { ToastService } from '@core/toast/toast.service';
import { LocationError, LocationPermissionService } from '@core/location/location-permission.service';
import type { RoutePlan, RouteStop } from '@dispatch/shared/contracts';
import { OrdersService } from '../../services/orders/orders.service';

// Maps URLs cap a route at 9 waypoints, so one link covers 9 waypoints plus the destination.
export const MAX_STOPS_PER_LINK = 10;

@Component({
  selector: 'app-route-plan-fab',
  standalone: true,
  imports: [CommonModule, PopupComponent, ButtonComponent],
  templateUrl: './route-plan-fab.component.html',
})
export class RoutePlanFabComponent {
  private readonly orders = inject(OrdersService);
  private readonly toast = inject(ToastService);
  readonly location = inject(LocationPermissionService);

  readonly maxStopsPerLink = MAX_STOPS_PER_LINK;

  open = false;
  loading = false;
  error = '';
  plan: RoutePlan | null = null;
  // Browser fix used for the plan; kept so the Maps link starts from the same point.
  origin: { latitude: number; longitude: number } | null = null;
  // Why the browser fix was missing, shown next to the fallback note.
  locationIssue = '';

  get stops(): RouteStop[] {
    return this.plan?.stops ?? [];
  }

  get overflow(): number {
    return Math.max(0, this.stops.length - MAX_STOPS_PER_LINK);
  }

  get mapsUrl(): string | null {
    return buildRouteUrl(this.stops, this.origin);
  }

  async calculate(): Promise<void> {
    this.open = true;
    this.loading = true;
    this.error = '';
    this.plan = null;

    this.locationIssue = '';
    try {
      this.origin = await this.location.request();
    } catch (err) {
      // Still plan from the last tracked fix, but tell the driver why.
      this.origin = null;
      this.locationIssue = err instanceof LocationError ? err.message : 'Your location could not be found.';
    }

    try {
      this.plan = await firstValueFrom(
        this.orders.getRoutePlan(this.origin?.latitude, this.origin?.longitude),
      );
    } catch (err) {
      const detail = err instanceof HttpErrorResponse ? err.error?.detail : null;
      this.error = typeof detail === 'string' ? detail : 'Could not calculate your route.';
    } finally {
      this.loading = false;
    }
  }

  close(): void {
    this.open = false;
  }

  openInMaps(): void {
    const url = this.mapsUrl;
    if (url) window.open(url, '_blank', 'noopener');
  }

  async copyLink(): Promise<void> {
    const url = this.mapsUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Google Maps link copied.');
    } catch {
      this.toast.error('Could not copy the link.');
    }
  }

  formatDuration(seconds: number | null): string | null {
    if (seconds == null) return null;
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} min`;
    const rest = minutes % 60;
    return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
  }

  formatDistance(meters: number | null): string | null {
    if (meters == null) return null;
    const km = meters / 1000;
    if (km < 1) return `${Math.round(meters / 10) * 10} m`;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }

  legLabel(stop: RouteStop): string | null {
    const time = this.formatDuration(stop.leg_duration_seconds);
    const span = this.formatDistance(stop.leg_distance_meters);
    if (time && span) return `${time} over ${span}`;
    return time ?? span;
  }

  get totalLabel(): string | null {
    const time = this.formatDuration(this.plan?.total_duration_seconds ?? null);
    const span = this.formatDistance(this.plan?.total_distance_meters ?? null);
    if (time && span) return `${time} over ${span}`;
    return time ?? span;
  }
}

// Waypoints are honoured in the given order; stops past the tenth wait for the next link.
export function buildRouteUrl(
  stops: RouteStop[],
  origin: { latitude: number; longitude: number } | null,
): string | null {
  if (stops.length === 0) return null;

  const leg = stops.slice(0, MAX_STOPS_PER_LINK);
  const destination = leg[leg.length - 1];
  const waypoints = leg.slice(0, -1);
  const coord = (s: { latitude: number; longitude: number }) => `${s.latitude},${s.longitude}`;

  const params = new URLSearchParams({ api: '1', travelmode: 'driving' });
  // Without an origin Maps web asks for a starting point instead of using the driver's position.
  if (origin) params.set('origin', coord(origin));
  params.set('destination', coord(destination));

  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map(coord).join('|'));
    // Place ids are only accepted when every waypoint has one.
    if (waypoints.every((s) => s.place_id)) {
      params.set('waypoint_place_ids', waypoints.map((s) => s.place_id).join('|'));
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
