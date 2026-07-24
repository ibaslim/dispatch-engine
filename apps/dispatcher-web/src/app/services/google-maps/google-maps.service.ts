import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BehaviorSubject } from 'rxjs';

interface PublicConfig {
  google_maps_api_key: string;
}

interface GoogleMapsWindow extends Window {
  __dispatchGoogleMapsReady?: () => void;
  google?: {
    maps: {
      importLibrary: (name: string) => Promise<PlacesLibrary>;
    };
  };
}

export interface GooglePlaceAutocompleteElement extends HTMLElement {
  value: string;
  placeholder: string;
  name: string;
  requestedRegion: string;
  noInputIcon: boolean;
}

export interface SelectedGooglePlace {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  manual?: boolean;
  operationalZoneId?: string;
  operationalZoneName?: string;
}

interface PlacePredictionSelectEvent extends Event {
  placePrediction: {
    toPlace: () => {
      id?: string;
      formattedAddress?: string;
      displayName?: string;
      location?: { lat: () => number; lng: () => number };
      fetchFields: (options: { fields: string[] }) => Promise<void>;
    };
  };
}

interface PlacesLibrary {
  PlaceAutocompleteElement: new () => GooglePlaceAutocompleteElement;
}

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private loadPromise?: Promise<PlacesLibrary>;
  private mapsLoadPromise?: Promise<void>;
  private apiKeyPromise?: Promise<string>;
  private readonly manualFallbackSubject = new BehaviorSubject(false);
  readonly manualFallback$ = this.manualFallbackSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  loadPlaces(): Promise<PlacesLibrary> {
    this.loadPromise ??= this.loadPlacesOnce().catch((error) => {
      this.loadPromise = undefined;
      throw error;
    });
    return this.loadPromise;
  }

  loadMaps(): Promise<void> {
    this.mapsLoadPromise ??= this.loadMapsOnce().catch((error) => {
      this.mapsLoadPromise = undefined;
      throw error;
    });
    return this.mapsLoadPromise;
  }

  getBrowserApiKey(): Promise<string> {
    this.apiKeyPromise ??= firstValueFrom(this.http.get<PublicConfig>('/api/v1/public/config'))
      .then((config) => {
        const apiKey = config.google_maps_api_key?.trim();
        if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured.');
        return apiKey;
      });
    return this.apiKeyPromise;
  }

  openAddress(address: string): void {
    if (typeof window === 'undefined') return;
    const query = address.trim();
    const url = query
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
      : 'https://www.google.com/maps';
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  isPlaceSelection(event: Event): event is PlacePredictionSelectEvent {
    return 'placePrediction' in event;
  }

  enableManualFallback(): boolean {
    if (this.manualFallbackSubject.value) return false;
    this.manualFallbackSubject.next(true);
    return true;
  }

  isQuotaError(error: unknown): boolean {
    let text = '';
    try {
      text = `${String(error)} ${JSON.stringify(error)}`.toLowerCase();
    } catch {
      text = String(error).toLowerCase();
    }
    return ['429', 'resource_exhausted', 'over_query_limit', 'quota', 'rate limit']
      .some((value) => text.includes(value));
  }

  private async loadPlacesOnce(): Promise<PlacesLibrary> {
    await this.loadMaps();

    const browserWindow = window as GoogleMapsWindow;
    if (!browserWindow.google?.maps.importLibrary) {
      throw new Error('Google Maps failed to initialize.');
    }
    return browserWindow.google.maps.importLibrary('places');
  }

  private async loadMapsOnce(): Promise<void> {
    if (typeof window === 'undefined') throw new Error('Google Maps requires a browser.');

    const browserWindow = window as GoogleMapsWindow;
    if (!browserWindow.google?.maps.importLibrary) {
      await this.injectScript(await this.getBrowserApiKey());
    }
    if (!browserWindow.google?.maps.importLibrary) {
      throw new Error('Google Maps failed to initialize.');
    }
  }

  private injectScript(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const browserWindow = window as GoogleMapsWindow;
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader]');
      if (existing) {
        if (browserWindow.google?.maps.importLibrary) {
          resolve();
          return;
        }
        existing.remove();
      }

      const cleanup = () => {
        delete browserWindow.__dispatchGoogleMapsReady;
      };
      browserWindow.__dispatchGoogleMapsReady = () => {
        cleanup();
        resolve();
      };

      const script = document.createElement('script');
      script.dataset['googleMapsLoader'] = 'true';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly&callback=__dispatchGoogleMapsReady`;
      script.async = true;
      script.onerror = () => {
        cleanup();
        script.remove();
        reject(new Error('Unable to load Google Maps.'));
      };
      document.head.appendChild(script);
    });
  }
}
