import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
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
import { FormsModule, NgModel } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';
import {
  GoogleMapsService,
  GooglePlaceAutocompleteElement,
} from '../../services/google-maps/google-maps.service';

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

  @Output() valueChange = new EventEmitter<string>();
  @Output() pinClick = new EventEmitter<void>();

  @ViewChild('model', { static: true }) model?: NgModel;
  @ViewChild('autocompleteHost', { static: true }) autocompleteHost?: ElementRef<HTMLDivElement>;

  autocompleteReady = false;
  private autocomplete?: GooglePlaceAutocompleteElement;
  private readonly onAutocompleteInput = () => this.onInput(this.autocomplete?.value ?? '');
  private readonly onAutocompleteError = () => this.disableAutocomplete();
  private readonly onPlaceSelected = (event: Event) => void this.selectPlace(event);

  constructor(
    private readonly googleMaps: GoogleMapsService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    void this.initializeAutocomplete();
  }

  ngOnChanges(): void {
    this.model?.control?.updateValueAndValidity();
    if (this.autocomplete && this.autocomplete.value !== this.value) {
      this.autocomplete.value = this.value;
    }
  }

  ngOnDestroy(): void {
    this.removeAutocompleteListeners();
  }

  onInput(v: string): void {
    this.valueChange.emit(v);
  }

  openInGoogleMaps(): void {
    this.googleMaps.openAddress(this.value);
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
      this.changeDetector.detectChanges();
    } catch {
      // Keep the normal address input available when Maps is not configured or unavailable.
      this.disableAutocomplete();
    }
  }

  private async selectPlace(event: Event): Promise<void> {
    if (!this.googleMaps.isPlaceSelection(event)) return;
    try {
      const place = event.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'displayName', 'location'] });
      const address = place.formattedAddress || place.displayName || this.autocomplete?.value || '';
      if (this.autocomplete) this.autocomplete.value = address;
      this.onInput(address);
    } catch {
      this.onInput(this.autocomplete?.value ?? '');
    }
  }

  private disableAutocomplete(): void {
    this.removeAutocompleteListeners();
    this.autocomplete?.remove();
    this.autocomplete = undefined;
    this.autocompleteReady = false;
    this.changeDetector.detectChanges();
  }

  private removeAutocompleteListeners(): void {
    this.autocomplete?.removeEventListener('input', this.onAutocompleteInput);
    this.autocomplete?.removeEventListener('gmp-select', this.onPlaceSelected);
    this.autocomplete?.removeEventListener('gmp-error', this.onAutocompleteError);
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
