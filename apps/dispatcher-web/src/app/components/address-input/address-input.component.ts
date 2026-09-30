import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewEncapsulation,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule, NgModel } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';
import {
  GoogleAddressComponent,
  GoogleMapsService,
  GooglePlaceAutocompleteElement,
  SelectedGooglePlace,
} from '@services/google-maps/google-maps.service';
import { OperationalZone } from '@services/delivery-configuration/delivery-configuration.service';
import { ToastService } from '@core/toast/toast.service';

@Component({
  selector: 'app-address-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, ErrorMessageComponent],
  templateUrl: './address-input.component.html',
  encapsulation: ViewEncapsulation.None,
  styles: [`
    app-address-input { display: block; }
    app-address-input .autocomplete-host { min-width: 0; }
    app-address-input .autocomplete-host gmp-place-autocomplete {
      display: block;
      width: 100%;
      height: 2.5rem;
      box-sizing: border-box;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background-color: white;
      color: #111827;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.25rem;
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(input) {
      height: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.75rem;
      border: 0;
      border-radius: 0.375rem;
      outline: 0;
      background: transparent;
      color: inherit;
      font: inherit;
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(focus-ring) {
      border-radius: 0.375rem;
      outline: 2px solid rgb(61 220 151 / 30%);
      outline-offset: 0;
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-list) {
      margin-top: 0.25rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      background-color: #ffffff;
      color: #111827;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%);
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item) {
      background-color: #ffffff;
      color: #111827;
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-main-text),
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-match),
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-nonmatch) {
      color: #111827;
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-secondary-text) {
      color: #6b7280;
    }
    app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-selected) {
      background-color: #f3f4f6;
      color: #111827;
    }
    .dark app-address-input .autocomplete-host gmp-place-autocomplete {
      border-color: #5a5d5a;
      background-color: #1e201e;
      color: #f3f4f6;
      color-scheme: dark;
    }
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-list) {
      border-color: #3f423f;
      background-color: #1e201e;
      color: #f3f4f6;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 35%), 0 4px 6px -4px rgb(0 0 0 / 35%);
    }
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item) {
      background-color: #1e201e;
      color: #f3f4f6;
    }
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-main-text),
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-match),
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-nonmatch) {
      color: #f3f4f6;
    }
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-secondary-text) {
      color: #9ca3af;
    }
    .dark app-address-input .autocomplete-host gmp-place-autocomplete::part(prediction-item-selected) {
      background-color: #2a2d2a;
      color: #f3f4f6;
    }
  `]
})
export class AddressInputComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() label = 'Address';
  @Input() placeholder = 'Enter a location';
  @Input() value = '';
  @Input() required = false;
  @Input() name = '';
  @Input() pattern?: string;
  @Input() showSubmitValidation = false;
  @Input() errorMessages: Partial<Record<'required' | 'pattern', string>> = {};
  @Input() operationalZones: OperationalZone[] = [];

  @Output() valueChange = new EventEmitter<string>();
  @Output() placeChange = new EventEmitter<SelectedGooglePlace | null>();
  @Output() pinClick = new EventEmitter<void>();

  @ViewChild('model', { static: true }) model?: NgModel;
  @ViewChild('autocompleteHost', { static: true }) autocompleteHost?: ElementRef<HTMLDivElement>;

  autocompleteReady = false;
  manualFallback = false;
  manualValue = '';
  manualTouched = false;
  manualMatchedRegion = '';
  // Set on a real (non-manual) Places selection that resolved to a city
  // outside every configured operational zone.
  zoneMismatch = false;
  private autocomplete?: GooglePlaceAutocompleteElement;
  private readonly onAutocompleteInput = () => this.onInput(this.autocomplete?.value ?? '');
  // Keep the custom element mounted when an individual prediction request fails.
  // Removing/recreating it here blurs the field after every keystroke and forces
  // the user to focus it again. The Places widget can handle a later request.
  private readonly onAutocompleteError = (event: Event) => this.activateManualFallback(event);
  private readonly onPlaceSelected = (event: Event) => void this.selectPlace(event);
  private manualFallbackSubscription?: Subscription;

  constructor(
    private readonly googleMaps: GoogleMapsService,
    private readonly toast: ToastService,
  ) {}

  ngAfterViewInit(): void {
    this.manualFallbackSubscription = this.googleMaps.manualFallback$.subscribe((enabled) => {
      if (!enabled || this.manualFallback) return;
      this.manualFallback = true;
      this.manualValue = '';
      this.manualMatchedRegion = '';
      this.zoneMismatch = false;
      this.placeChange.emit(null);
    });
    void this.initializeAutocomplete();
  }

  ngOnChanges(): void {
    if (this.autocomplete && this.autocomplete.value !== this.value) {
      this.autocomplete.value = this.value;
    }
  }

  ngOnDestroy(): void {
    this.removeAutocompleteListeners();
    this.manualFallbackSubscription?.unsubscribe();
  }

  onInput(v: string): void {
    this.valueChange.emit(v);
    this.placeChange.emit(null);
    this.zoneMismatch = false;
  }

  openInGoogleMaps(): void {
    this.googleMaps.openAddress(this.value);
  }

  onManualInput(address: string): void {
    this.manualValue = address;
    this.manualTouched = true;
    this.valueChange.emit(address);
    const match = this.findOperationalMatch(address);
    this.manualMatchedRegion = match?.matchedName || '';
    if (!match) {
      this.placeChange.emit(null);
      return;
    }
    this.placeChange.emit({
      placeId: `manual:${match.zone.id}`,
      formattedAddress: address.trim(),
      latitude: 0,
      longitude: 0,
      manual: true,
      operationalZoneId: match.zone.id,
      operationalZoneName: match.zone.name,
    });
  }

  private async initializeAutocomplete(): Promise<void> {
    try {
      const { PlaceAutocompleteElement } = await this.googleMaps.loadPlaces();
      if (!this.autocompleteHost) return;

      const autocomplete = new PlaceAutocompleteElement();
      autocomplete.value = this.value;
      autocomplete.placeholder = this.placeholder;
      autocomplete.name = `${this.getName()}Autocomplete`;
      autocomplete.requestedRegion = 'ca';
      autocomplete.noInputIcon = true;
      autocomplete.addEventListener('input', this.onAutocompleteInput);
      autocomplete.addEventListener('gmp-select', this.onPlaceSelected);
      autocomplete.addEventListener('gmp-error', this.onAutocompleteError);

      this.autocomplete = autocomplete;
      this.autocompleteHost.nativeElement.appendChild(autocomplete);
      this.autocompleteReady = true;
    } catch (error) {
      if (this.googleMaps.isQuotaError(error)) {
        this.activateManualFallback(error);
        return;
      }
      // Keep the normal address input available when Maps is not configured or unavailable.
      this.disableAutocomplete();
    }
  }

  private async selectPlace(event: Event): Promise<void> {
    if (!this.googleMaps.isPlaceSelection(event)) return;
    try {
      const place = event.placePrediction.toPlace();
      // addressComponents rides along in this same request — Places API (New)
      // bills per call, not per field, so this costs nothing extra and avoids
      // a second lookup (client- or server-side) just to learn the city.
      await place.fetchFields({
        fields: ['id', 'formattedAddress', 'displayName', 'location', 'addressComponents'],
      });
      const address = place.formattedAddress || place.displayName || this.autocomplete?.value || '';
      if (this.autocomplete) this.autocomplete.value = address;
      this.valueChange.emit(address);
      if (!place.id || !place.location) {
        this.placeChange.emit(null);
        this.zoneMismatch = false;
        return;
      }
      const match = this.matchZoneFromComponents(place.addressComponents);
      // Only flag a mismatch once the zones list has actually loaded — an
      // empty list just means "not fetched yet", never "nothing is in zone".
      this.zoneMismatch = this.operationalZones.length > 0 && !match;
      this.placeChange.emit({
        placeId: place.id,
        formattedAddress: address,
        latitude: place.location.lat(),
        longitude: place.location.lng(),
        operationalZoneId: match?.zone.id,
        operationalZoneName: match?.zone.name,
      });
    } catch (error) {
      if (this.googleMaps.isQuotaError(error)) {
        this.activateManualFallback(error);
        return;
      }
      this.onInput(this.autocomplete?.value ?? '');
    }
  }

  private disableAutocomplete(): void {
    this.removeAutocompleteListeners();
    this.autocomplete?.remove();
    this.autocomplete = undefined;
    this.autocompleteReady = false;
  }

  private removeAutocompleteListeners(): void {
    this.autocomplete?.removeEventListener('input', this.onAutocompleteInput);
    this.autocomplete?.removeEventListener('gmp-select', this.onPlaceSelected);
    this.autocomplete?.removeEventListener('gmp-error', this.onAutocompleteError);
  }

  private activateManualFallback(_error: unknown): void {
    const firstNotification = this.googleMaps.enableManualFallback();
    if (firstNotification) {
      this.toast.warning(
        'Google address lookup quota is exhausted. Enter pickup and delivery addresses manually.'
      );
    }
  }

  /** City + province from Google's structured components, matched exactly against
   * a zone's cities — the same fields and comparison the backend's own zone
   * resolution (`_resolve_location`) uses, so the two never disagree. */
  private matchZoneFromComponents(
    components: GoogleAddressComponent[] | undefined,
  ): { zone: OperationalZone } | null {
    if (!components?.length) return null;
    const city = this.componentText(components, 'locality', 'postal_town');
    const province = this.componentText(components, 'administrative_area_level_1');
    if (!city || !province) return null;

    for (const zone of this.operationalZones) {
      const hit = zone.cities.some(
        (c) => c.name.toLocaleLowerCase() === city && c.state_name.toLocaleLowerCase() === province,
      );
      if (hit) return { zone };
    }
    return null;
  }

  private componentText(components: GoogleAddressComponent[], ...types: string[]): string {
    const found = components.find((c) => types.some((type) => c.types.includes(type)));
    return (found?.longText ?? '').toLocaleLowerCase().trim();
  }

  private findOperationalMatch(address: string): { zone: OperationalZone; matchedName: string } | null {
    const normalized = this.normalize(address);
    if (!normalized) return null;
    const matches: Array<{ zone: OperationalZone; matchedName: string }> = [];
    for (const zone of this.operationalZones) {
      if (normalized.includes(this.normalize(zone.name))) {
        matches.push({ zone, matchedName: zone.name });
      }
      for (const city of zone.cities) {
        if (normalized.includes(this.normalize(city.name))) {
          matches.push({ zone, matchedName: city.name });
        }
      }
    }
    return matches.sort((a, b) => b.matchedName.length - a.matchedName.length)[0] || null;
  }

  private normalize(value: string): string {
    return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'address';
  }

  get showError(): boolean {
    const m = this.model;

    return !!(
      m &&
      m.invalid &&
      (m.touched || m.dirty || this.showSubmitValidation)
    );
  }

  get errorList(): string[] {
    const m = this.model;
    if (!m || !m.errors) return [];

    return [
      m.errors['required'] ? (this.errorMessages.required || 'Address is required.') : '',
      m.errors['pattern'] ? (this.errorMessages.pattern || 'Invalid address format.') : ''
    ].filter(Boolean);
  }
}
