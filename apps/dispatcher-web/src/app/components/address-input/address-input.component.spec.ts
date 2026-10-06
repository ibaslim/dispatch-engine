import { TestBed } from '@angular/core/testing';

import { ToastService } from '../../core/toast/toast.service';
import type { OperationalZone } from '../../services/delivery-configuration/delivery-configuration.service';
import { GoogleMapsService, type SelectedGooglePlace } from '../../services/google-maps/google-maps.service';
import { AddressInputComponent } from './address-input.component';

type Component = {
  operationalZones: OperationalZone[];
  zoneMismatch: boolean;
  valueChange: { subscribe: (fn: (value: string) => void) => void };
  placeChange: { subscribe: (fn: (place: SelectedGooglePlace | null) => void) => void };
  selectPlace: (event: Event) => Promise<void>;
  autocomplete?: { value: string; removeEventListener: () => void };
};

const GTA = { id: 'z1', name: 'GTA', cities: [{ name: 'Toronto', state_name: 'Ontario' }] } as unknown as OperationalZone;

const component = (text: string, short = text, ...types: string[]) => ({ types, longText: text, shortText: short });

const TORONTO = [
  component('Toronto', 'Toronto', 'locality'),
  component('Ontario', 'ON', 'administrative_area_level_1'),
  component('Canada', 'ca', 'country'),
];

function fakePlace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ChIJ-toronto',
    formattedAddress: '100 Queen St W, Toronto, ON, Canada',
    location: { lat: () => 43.65, lng: () => -79.38 },
    addressComponents: TORONTO,
    fetchFields: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** The widget's input box, as far as the component touches it. */
function typedBox(value: string) {
  return { value, removeEventListener: jest.fn() };
}

function selection(place: ReturnType<typeof fakePlace>): Event {
  return Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => place } });
}

function setup(zones: OperationalZone[] = [GTA]) {
  TestBed.configureTestingModule({});
  TestBed.overrideComponent(AddressInputComponent, { set: { template: '', imports: [] } });
  // Not rendered, so the Google widget is never loaded; only the selection logic runs.
  const instance = TestBed.createComponent(AddressInputComponent).componentInstance as unknown as Component;
  instance.operationalZones = zones;
  const addresses: string[] = [];
  const places: (SelectedGooglePlace | null)[] = [];
  instance.valueChange.subscribe((value) => addresses.push(value));
  instance.placeChange.subscribe((place) => places.push(place));
  return { instance, addresses, places };
}

describe('AddressInputComponent choosing a suggestion', () => {
  it('asks Google only for fields that bill as Essentials', async () => {
    const { instance } = setup();
    const place = fakePlace();
    await instance.selectPlace(selection(place));

    expect(place.fetchFields).toHaveBeenCalledWith({
      fields: ['id', 'formattedAddress', 'location', 'addressComponents'],
    });
  });

  it('emits the address, the coordinates, and the city, province and country from the same lookup', async () => {
    const { instance, addresses, places } = setup();
    await instance.selectPlace(selection(fakePlace()));

    expect(addresses).toEqual(['100 Queen St W, Toronto, ON, Canada']);
    expect(places).toEqual([
      {
        placeId: 'ChIJ-toronto',
        formattedAddress: '100 Queen St W, Toronto, ON, Canada',
        latitude: 43.65,
        longitude: -79.38,
        city: 'Toronto',
        province: 'Ontario',
        countryCode: 'CA',
        operationalZoneId: 'z1',
        operationalZoneName: 'GTA',
      },
    ]);
    expect(instance.zoneMismatch).toBe(false);
  });

  it('sends the city and province as Google wrote them, not lower-cased', async () => {
    const { instance, places } = setup();
    await instance.selectPlace(selection(fakePlace()));

    expect([places[0]?.city, places[0]?.province]).toEqual(['Toronto', 'Ontario']);
  });

  it('upper-cases the country code', async () => {
    const { instance, places } = setup();
    await instance.selectPlace(selection(fakePlace()));

    expect(places[0]?.countryCode).toBe('CA');
  });

  it('uses the postal town when there is no locality', async () => {
    const { instance, places } = setup();
    const components = [component('Toronto', 'Toronto', 'postal_town'), TORONTO[1], TORONTO[2]];
    await instance.selectPlace(selection(fakePlace({ addressComponents: components })));

    expect(places[0]?.city).toBe('Toronto');
  });

  it('flags an address outside every zone, but still hands it on', async () => {
    const { instance, places } = setup();
    const calgary = [component('Calgary', 'Calgary', 'locality'), component('Alberta', 'AB', 'administrative_area_level_1'), TORONTO[2]];
    await instance.selectPlace(selection(fakePlace({ addressComponents: calgary })));

    expect(instance.zoneMismatch).toBe(true);
    expect(places[0]).toMatchObject({ city: 'Calgary', province: 'Alberta' });
    expect(places[0]?.operationalZoneId).toBeUndefined();
  });

  it('does not flag a mismatch before the zones have loaded', async () => {
    const { instance } = setup([]);
    await instance.selectPlace(selection(fakePlace()));

    expect(instance.zoneMismatch).toBe(false);
  });

  it('hands on empty city details when Google returned no components', async () => {
    const { instance, places } = setup();
    await instance.selectPlace(selection(fakePlace({ addressComponents: undefined })));

    expect(places[0]).toMatchObject({ city: '', province: '', countryCode: '' });
    expect(instance.zoneMismatch).toBe(true);
  });

  it('clears the place when Google returned no id or no coordinates', async () => {
    const { instance, places } = setup();
    await instance.selectPlace(selection(fakePlace({ id: undefined })));
    await instance.selectPlace(selection(fakePlace({ location: undefined })));

    expect(places).toEqual([null, null]);
    expect(instance.zoneMismatch).toBe(false);
  });

  it('falls back to what was typed when Google gives no formatted address', async () => {
    const { instance, addresses } = setup();
    instance.autocomplete = typedBox('typed text');
    await instance.selectPlace(selection(fakePlace({ formattedAddress: '' })));

    expect(addresses).toEqual(['typed text']);
  });

  it('ignores events that are not a chosen suggestion', async () => {
    const { instance, addresses, places } = setup();
    await instance.selectPlace(new Event('gmp-select'));

    expect([addresses, places]).toEqual([[], []]);
  });
});

describe('AddressInputComponent when the lookup fails', () => {
  it('switches to manual addresses when Google is out of quota', async () => {
    const { instance, places } = setup();
    const manual = jest.spyOn(TestBed.inject(GoogleMapsService), 'enableManualFallback').mockReturnValue(true);
    const warn = jest.spyOn(TestBed.inject(ToastService), 'warning').mockImplementation(() => undefined);
    const place = fakePlace({ fetchFields: jest.fn().mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED')) });
    await instance.selectPlace(selection(place));

    expect(manual).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(places).toEqual([]);
  });

  it('keeps the typed text and clears the place on any other failure', async () => {
    const { instance, addresses, places } = setup();
    instance.autocomplete = typedBox('typed text');
    const place = fakePlace({ fetchFields: jest.fn().mockRejectedValue(new Error('network down')) });
    await instance.selectPlace(selection(place));

    expect(addresses).toEqual(['typed text']);
    expect(places).toEqual([null]);
  });
});
