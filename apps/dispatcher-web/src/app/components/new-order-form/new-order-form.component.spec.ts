import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ToastService } from '../../core/toast/toast.service';
import type { DeliveryRouteQuote, NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { GoogleMapsService, type SelectedGooglePlace } from '../../services/google-maps/google-maps.service';
import { OtherOrderDetailsComponent } from '../other-order-details/other-order-details.component';
import { createDefaultNewOrder } from '@pages/orders/orders-mapping.util';
import { NewOrderFormComponent } from './new-order-form.component';

const QUOTE_URL = '/api/v1/orders/quote';

function place(id: string, extra: Partial<SelectedGooglePlace> = {}): SelectedGooglePlace {
  return {
    placeId: id,
    formattedAddress: `1 Main St (${id})`,
    latitude: 43.7,
    longitude: -79.4,
    city: 'Toronto',
    province: 'Ontario',
    countryCode: 'CA',
    ...extra,
  };
}

function quoteBody(overrides: Partial<DeliveryRouteQuote> = {}): DeliveryRouteQuote {
  return {
    eligible: true,
    pickup_city: 'Toronto',
    pickup_zone_id: 'z1',
    pickup_zone_name: 'GTA',
    delivery_city: 'Toronto',
    delivery_zone_id: 'z1',
    delivery_zone_name: 'GTA',
    distance_meters: 12000,
    distance_km: 12,
    duration_seconds: 600,
    radius_km: 30,
    extra_distance_km: 0,
    base_price: 400,
    additional_per_km: 5,
    distance_charge: 0,
    applied_charges: [],
    delivery_fee: 400,
    gst_rate: 5,
    pst_rate: 8,
    quote_id: 'q1',
    ...overrides,
  };
}

/** Both places set and a subtotal of 100, so a quote has everything it needs. */
function readyValue(): NewOrderFormValue {
  const value = createDefaultNewOrder();
  value.pickup.location = place('P1');
  value.delivery.location = place('P2');
  value.deliveryCategoryId = 'cat-1';
  value.details.subtotal = 100;
  return value;
}

function setup(initial: NewOrderFormValue = readyValue()) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.overrideComponent(NewOrderFormComponent, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(NewOrderFormComponent);
  const component = fixture.componentInstance;
  const http = TestBed.inject(HttpTestingController);
  const emitted: NewOrderFormValue[] = [];
  // The parent normally feeds each emitted value back in through [value].
  component.valueChange.subscribe((value: NewOrderFormValue) => {
    emitted.push(value);
    component.value = value;
  });
  component.value = initial;
  return { fixture, component, http, emitted };
}

function quoteRequests(http: HttpTestingController): TestRequest[] {
  return http.match((req) => req.url === QUOTE_URL);
}

function automaticRequests(http: HttpTestingController): TestRequest[] {
  return http.match((req) => req.url.endsWith('/discounts/automatic'));
}

/** Lets the component's awaiting code run; it uses native async/await, so fakeAsync cannot. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function answer(request: TestRequest, body: DeliveryRouteQuote = quoteBody()): Promise<void> {
  request.flush(body);
  await settle();
}

async function fail(request: TestRequest, status: number, body: unknown): Promise<void> {
  request.flush(body, { status, statusText: 'error' });
  await settle();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('NewOrderFormComponent quoting', () => {
  it('quotes once, after a 0.4 s pause, with the places and category chosen', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-1');

    jest.advanceTimersByTime(399);
    expect(quoteRequests(http)).toHaveLength(0);

    jest.advanceTimersByTime(1);
    const requests = quoteRequests(http);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body).toMatchObject({
      pickup_place_id: 'P1',
      delivery_place_id: 'P2',
      delivery_category_id: 'cat-1',
      quote_id: null,
      surcharge_ids: [],
    });
  });

  it('makes one request for a burst of changes, using the last one', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(100);
    component.onCategoryChange('cat-b');
    jest.advanceTimersByTime(400);

    const requests = quoteRequests(http);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body.delivery_category_id).toBe('cat-b');
  });

  it('does not quote until both places and a category are set', async () => {
    const value = readyValue();
    value.delivery.location = null;
    const { component, http } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(1000);

    expect(quoteRequests(http)).toHaveLength(0);
  });

  it('sends the browser place details, and none for a manual address', async () => {
    const value = readyValue();
    value.delivery.location = place('manual:z1', { manual: true, city: undefined });
    const { component, http } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);

    const body = quoteRequests(http)[0].request.body;
    expect(body.pickup_place).toEqual({
      place_id: 'P1',
      formatted_address: '1 Main St (P1)',
      latitude: 43.7,
      longitude: -79.4,
      city: 'Toronto',
      province: 'Ontario',
      country_code: 'CA',
    });
    expect(body.delivery_place).toBeNull();
  });

  it('sends no place details for an address without a city', async () => {
    const value = readyValue();
    value.pickup.location = place('P1', { city: '' });
    const { component, http } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);

    expect(quoteRequests(http)[0].request.body.pickup_place).toBeNull();
  });
});

describe('NewOrderFormComponent several open forms', () => {
  it('keeps a separate quote for each form', async () => {
    const { component: first, http } = setup();
    const second = TestBed.createComponent(NewOrderFormComponent).componentInstance;
    second.value = readyValue();

    first.onCategoryChange('cat-1');
    expect(first.isQuoting).toBe(true);
    expect(second.isQuoting).toBe(false);

    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ quote_id: 'first-form' }));
    second.onCategoryChange('cat-2');
    jest.advanceTimersByTime(400);

    expect(quoteRequests(http)[0].request.body.quote_id).toBeNull();
  });
});

describe('NewOrderFormComponent what triggers a quote', () => {
  it('quotes again when a surcharge is ticked', async () => {
    const { component, http } = setup();
    component.toggleSurcharge('s1');
    jest.advanceTimersByTime(400);

    expect(quoteRequests(http)[0].request.body.surcharge_ids).toEqual(['s1']);
  });

  it('quotes again when the delivery time changes', async () => {
    const value = readyValue();
    const { component, http } = setup(value);
    component.onDeliveryChange({ ...value.delivery, deliveryTimeSpecified: true, deliveryTime: '23:30' });
    jest.advanceTimersByTime(400);

    expect(quoteRequests(http)).toHaveLength(1);
  });

  it('quotes again when an address changes', async () => {
    const value = readyValue();
    const { component, http } = setup(value);
    component.onPickupChange({ ...value.pickup, location: place('P3') });
    jest.advanceTimersByTime(400);

    expect(quoteRequests(http)[0].request.body.pickup_place_id).toBe('P3');
  });

  it('does not quote when only the pickup time changes', async () => {
    const value = readyValue();
    const { component, http } = setup(value);
    component.onPickupChange({ ...value.pickup, pickupTimeSpecified: true, pickupTime: '09:00' });
    jest.advanceTimersByTime(1000);

    expect(quoteRequests(http)).toHaveLength(0);
  });
});

describe('NewOrderFormComponent the delivery schedule in the quote', () => {
  function bodyFor(change: (value: NewOrderFormValue) => void) {
    const value = readyValue();
    change(value);
    const { component, http } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    return quoteRequests(http)[0].request.body;
  }

  it('sends a ticked time as specified', async () => {
    const body = bodyFor((v) => {
      v.delivery.deliveryDate = '2026-10-05';
      v.delivery.deliveryTimeSpecified = true;
      v.delivery.deliveryTime = '14:30';
    });
    expect([body.delivery_planned_at, body.delivery_time_specified]).toEqual(['2026-10-05T14:30:00', true]);
  });

  it('sends a date-only delivery at midnight, not specified', async () => {
    const body = bodyFor((v) => {
      v.delivery.deliveryDate = '2026-10-05';
      v.delivery.deliveryTimeSpecified = false;
    });
    expect([body.delivery_planned_at, body.delivery_time_specified]).toEqual(['2026-10-05T00:00:00', false]);
  });

  it('sends no planned time without a date', async () => {
    const body = bodyFor((v) => {
      v.delivery.deliveryDate = '';
    });
    expect([body.delivery_planned_at, body.delivery_time_specified]).toEqual([null, false]);
  });
});

describe('NewOrderFormComponent the quote lock', () => {
  it('sends the previous quote id with the next quote', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ quote_id: 'q1' }));

    component.onCategoryChange('cat-b');
    jest.advanceTimersByTime(400);
    expect(quoteRequests(http)[0].request.body.quote_id).toBe('q1');
  });

  it('forgets the quote id when an address is cleared', async () => {
    const value = readyValue();
    const { component, http } = setup(value);
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ quote_id: 'q1' }));

    component.onDeliveryChange({ ...component.value.delivery, location: null });
    component.onDeliveryChange({ ...component.value.delivery, location: place('P2') });
    component.onCategoryChange('cat-b');
    jest.advanceTimersByTime(400);
    expect(quoteRequests(http)[0].request.body.quote_id).toBeNull();
  });

  it('forgets the quote id after a failed quote', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ quote_id: 'q1' }));

    component.onCategoryChange('cat-b');
    jest.advanceTimersByTime(400);
    await fail(quoteRequests(http)[0], 422, { detail: 'No price.' });

    component.onCategoryChange('cat-c');
    jest.advanceTimersByTime(400);
    expect(quoteRequests(http)[0].request.body.quote_id).toBeNull();
  });

  it('fetches a fresh quote at once when the parent asks for one', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ quote_id: 'q1' }));

    component.ngOnChanges({ requoteTick: new SimpleChange(0, 1, false) });
    const requests = quoteRequests(http);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body.quote_id).toBe('q1');
  });

  it('does not requote on the first value of the refresh input', async () => {
    const { component, http } = setup();
    component.ngOnChanges({ requoteTick: new SimpleChange(undefined, 0, true) });

    expect(quoteRequests(http)).toHaveLength(0);
  });
});

describe('NewOrderFormComponent opening a saved order', () => {
  function flushConfiguration(http: HttpTestingController): void {
    http.match((req) => req.url !== QUOTE_URL).forEach((req) => req.flush([]));
  }

  it('quotes a reopened order once, so what is shown is what a save charges', async () => {
    const reopened = readyValue();
    reopened.routeQuote = quoteBody({ quote_id: undefined, base_price: 400 });
    const { fixture, http } = setup(reopened);

    fixture.detectChanges();
    flushConfiguration(http);
    await settle();

    expect(quoteRequests(http)).toHaveLength(1);
  });

  it('does not quote a new, empty order', async () => {
    const { fixture, http } = setup(readyValue());

    fixture.detectChanges();
    flushConfiguration(http);
    await settle();

    expect(quoteRequests(http)).toHaveLength(0);
  });
});

describe('NewOrderFormComponent totals from a quote', () => {
  it('applies the fee and both taxes to the totals', async () => {
    const { component, http, emitted } = setup();
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ delivery_fee: 400, gst_rate: 5, pst_rate: 8 }));

    const last = emitted[emitted.length - 1];
    expect(last.routeQuote?.quote_id).toBe('q1');
    expect(last.details).toMatchObject({
      deliveryFees: 400, gstRate: 5, pstRate: 8, gstAmount: 5, pstAmount: 8, total: 513,
    });
  });

  it('rounds each tax to cents on its own', async () => {
    const value = readyValue();
    value.details.subtotal = 33.33;
    const { component, http, emitted } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ delivery_fee: 0, gst_rate: 5, pst_rate: 8 }));

    const last = emitted[emitted.length - 1];
    expect([last.details.gstAmount, last.details.pstAmount, last.details.total]).toEqual([1.67, 2.67, 37.67]);
  });

  it('rounds a half cent of tax to the even cent, as the server saves it', async () => {
    const value = readyValue();
    value.details.subtotal = 10.1;
    const { component, http, emitted } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ delivery_fee: 0, gst_rate: 5, pst_rate: 0 }));

    expect(emitted[emitted.length - 1].details.gstAmount).toBe(0.5);
  });

  it('keeps the tip in the total', async () => {
    const value = readyValue();
    value.details.deliveryTips = 10;
    const { component, http, emitted } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ delivery_fee: 400, gst_rate: 5, pst_rate: 8 }));

    expect(emitted[emitted.length - 1].details.total).toBe(523);
  });
});

describe('NewOrderFormComponent when a quote fails', () => {
  it('shows the server message and zeroes the fee and taxes', async () => {
    const { component, http, emitted } = setup();
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await fail(quoteRequests(http)[0], 422, { detail: 'Calgary, Alberta is outside the operational zones.' });

    expect(component.quoteError).toBe('Calgary, Alberta is outside the operational zones.');
    const last = emitted[emitted.length - 1];
    expect(last.routeQuote).toBeNull();
    expect(last.details).toMatchObject({ deliveryFees: 0, gstAmount: 0, pstAmount: 0, total: 100 });
    expect(component.isQuoting).toBe(false);
  });

  it('shows a generic message when the server gives none', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await fail(quoteRequests(http)[0], 500, '');

    expect(component.quoteError).toBe('Unable to validate this delivery route.');
  });

  it('switches to manual addresses and warns once when Google is out of quota', async () => {
    const { component, http } = setup();
    const manual = jest.spyOn(TestBed.inject(GoogleMapsService), 'enableManualFallback').mockReturnValue(true);
    const warn = jest.spyOn(TestBed.inject(ToastService), 'warning').mockImplementation(() => undefined);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await fail(quoteRequests(http)[0], 429, { detail: 'Google Maps API quota is exhausted.' });

    expect(manual).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('cancels the request in flight when a newer change arrives', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(400);
    const inFlight = quoteRequests(http)[0];

    component.onCategoryChange('cat-b');

    expect(inFlight.cancelled).toBe(true);
  });

  it('cancels a quote that is still waiting when an address is cleared', async () => {
    const { component, http } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(200);
    component.onDeliveryChange({ ...component.value.delivery, location: null });
    jest.advanceTimersByTime(1000);

    expect(quoteRequests(http)).toHaveLength(0);
    expect(component.isQuoting).toBe(false);
  });

  it('ignores an answer that arrives after a newer change', async () => {
    const { component, http, emitted } = setup();
    component.onCategoryChange('cat-a');
    jest.advanceTimersByTime(400);
    const stale = quoteRequests(http)[0];

    component.onCategoryChange('cat-b');
    jest.advanceTimersByTime(400);
    const fresh = quoteRequests(http)[0];

    if (!stale.cancelled) await answer(stale, quoteBody({ delivery_fee: 111, quote_id: 'stale' }));
    expect(emitted[emitted.length - 1].routeQuote).toBeNull();

    await answer(fresh, quoteBody({ delivery_fee: 400, quote_id: 'fresh' }));
    expect(emitted[emitted.length - 1].routeQuote?.quote_id).toBe('fresh');
  });
});

describe('NewOrderFormComponent automatic discounts', () => {
  const offer = (id: string, amount: number) => ({
    discount: { id, title: id },
    amount,
    state: 'applied',
  });

  it('asks for the automatic discounts on the quoted fee, and shows what comes back', async () => {
    const { component, http, emitted } = setup();
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ delivery_fee: 400 }));

    const [request] = automaticRequests(http);
    expect(request.request.params.get('delivery_fee')).toBe('400');
    expect(request.request.params.get('at')).toBeTruthy();
    request.flush([offer('a', 40)]);
    await settle();

    expect(emitted[emitted.length - 1].details.automaticOffers).toEqual([offer('a', 40)]);
    expect(emitted[emitted.length - 1].details.discount).toBe(40);
  });

  it('keeps the newest answer when two requests overlap', async () => {
    const { component, http, emitted } = setup();
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody({ delivery_fee: 400 }));
    const older = automaticRequests(http)[0];

    component.onDetailsChange({ ...component.value.details, optedOutDiscountIds: ['x'] });
    const newer = automaticRequests(http)[0];
    expect(newer.request.params.getAll('opted_out')).toEqual(['x']);

    if (!older.cancelled) older.flush([offer('old', 99)]);
    newer.flush([offer('new', 40)]);
    await settle();

    expect(emitted[emitted.length - 1].details.automaticOffers).toEqual([offer('new', 40)]);
  });

  it('does not ask without a pickup date', async () => {
    const value = readyValue();
    value.pickup.pickupDate = '';
    const { component, http } = setup(value);
    component.onCategoryChange('cat-1');
    jest.advanceTimersByTime(400);
    await answer(quoteRequests(http)[0], quoteBody());

    expect(automaticRequests(http)).toHaveLength(0);
  });
});

describe('tax and totals: the form and the details component agree', () => {
  const subtotals = [0, 0.01, 0.07, 9.99, 12.34, 19.99, 33.33, 100, 1234.56];
  const rates = [
    { gst: 5, pst: 8 },
    { gst: 5, pst: 9.975 },
    { gst: 13, pst: 0 },
    { gst: 0, pst: 0 },
  ];

  function formTotals(subtotal: number, gst: number, pst: number, fee: number) {
    TestBed.resetTestingModule();
    const { component } = setup();
    const details = { ...createDefaultNewOrder().details, subtotal, deliveryTips: 0 };
    const quote = quoteBody({ delivery_fee: fee, gst_rate: gst, pst_rate: pst });
    const result = (component as unknown as {
      withQuotedCharges: (d: typeof details, q: DeliveryRouteQuote) => typeof details;
    }).withQuotedCharges(details, quote);
    return [result.gstAmount, result.pstAmount, result.total];
  }

  function detailsTotals(subtotal: number, gst: number, pst: number, fee: number) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(OtherOrderDetailsComponent, { set: { template: '', imports: [] } });
    const component = TestBed.createComponent(OtherOrderDetailsComponent).componentInstance;
    let out = createDefaultNewOrder().details;
    component.value = {
      ...out,
      items: [{ itemName: 'x', itemPrice: String(subtotal), itemQty: '1' }],
    };
    component.valueChange.subscribe((details: typeof out) => (out = details));
    component.patch({ gstRate: gst, pstRate: pst, deliveryFees: fee });
    return [out.gstAmount, out.pstAmount, out.total];
  }

  it.each(subtotals.flatMap((subtotal) => rates.map((rate) => ({ subtotal, ...rate }))))(
    'subtotal $subtotal at GST $gst% and PST $pst%',
    ({ subtotal, gst, pst }) => {
      expect(formTotals(subtotal, gst, pst, 400)).toEqual(detailsTotals(subtotal, gst, pst, 400));
    },
  );
});
