import { Injectable, signal } from '@angular/core';

export type LocationStatus =
  | 'unknown'
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'insecure';

export interface Coords {
  latitude: number;
  longitude: number;
}

export class LocationError extends Error {
  constructor(readonly status: LocationStatus, message: string) {
    super(message);
  }
}

const REQUEST_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 };

// Single source of truth for browser location access, shared by the route button, banner and map.
@Injectable({ providedIn: 'root' })
export class LocationPermissionService {
  private readonly _status = signal<LocationStatus>('unknown');
  readonly status = this._status.asReadonly();

  private watching = false;

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<LocationStatus> {
    // Browsers only expose geolocation on HTTPS or localhost; a LAN IP over http is blocked outright.
    if (!window.isSecureContext) return this.set('insecure');
    if (!('geolocation' in navigator)) return this.set('unsupported');

    if (!navigator.permissions?.query) {
      // Safari before 16 has no Permissions API; the state is only learned by asking.
      return this._status() === 'unknown' ? this.set('prompt') : this._status();
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      if (!this.watching) {
        this.watching = true;
        // Fires when the user flips the site setting, so the banner reacts without a reload.
        result.onchange = () => this.set(result.state as LocationStatus);
      }
      return this.set(result.state as LocationStatus);
    } catch {
      return this.set('prompt');
    }
  }

  // Triggers the browser prompt when needed and resolves the current fix.
  request(options: PositionOptions = REQUEST_OPTIONS): Promise<Coords> {
    const blocked = this._status();
    if (blocked === 'insecure' || blocked === 'unsupported') {
      return Promise.reject(new LocationError(blocked, this.explain(blocked)));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.set('granted');
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        (err) => {
          const status = this.statusFor(err);
          if (status === 'denied') this.set('denied');
          reject(new LocationError(status, this.explain(status)));
        },
        options,
      );
    });
  }

  statusFor(err: GeolocationPositionError): LocationStatus {
    return err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
  }

  explain(status: LocationStatus): string {
    switch (status) {
      case 'denied':
        return 'Location is blocked for this site. Click the lock icon in the address bar, set Location to Allow, then reload.';
      case 'insecure':
        return 'Location only works over HTTPS or on localhost. Open this site with https:// to use it.';
      case 'unsupported':
        return 'This browser does not support location.';
      case 'unavailable':
        return 'Your location could not be found. Check that location services are on for this device, then try again.';
      case 'prompt':
        return 'Allow location so routes start from where you are.';
      default:
        return '';
    }
  }

  private set(status: LocationStatus): LocationStatus {
    this._status.set(status);
    return status;
  }
}
