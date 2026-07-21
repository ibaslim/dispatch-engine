import { SimpleChange } from '@angular/core';

import { PhoneCountry } from '@models/phone-countries/phone-countries.model';
import { PhoneInputComponent } from './phone-input.component';

describe('PhoneInputComponent', () => {
  it('keeps the same country options reference between change-detection passes', () => {
    const component = new PhoneInputComponent();
    const options = component.countryOptions;

    component.ngOnChanges({});

    expect(component.countryOptions).toBe(options);
  });

  it('rebuilds country options only when the countries input changes', () => {
    const component = new PhoneInputComponent();
    const countries: PhoneCountry[] = [
      { iso: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
      { iso: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
    ];

    component.countries = countries;
    component.ngOnChanges({
      countries: new SimpleChange(undefined, countries, false),
    });

    expect(component.countryOptions).toEqual([
      { value: '+1', label: '🇺🇸 +1' },
      { value: '+44', label: '🇬🇧 +44' },
    ]);
  });
});
