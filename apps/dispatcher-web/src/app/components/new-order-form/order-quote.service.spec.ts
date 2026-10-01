import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { DeliveryRouteQuote, NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import type { SelectedGooglePlace } from '../../services/google-maps/google-maps.service';
import { createDefaultNewOrder } from '@pages/orders/orders-mapping.util';
import { canQuote, OrderQuoteService, QUOTE_PAUSE_MS, type QuoteResult } from './order-quote.service';

const QUOTE_URL = '/api/v1/orders/quote';

function place(id: string, extra: Partial<SelectedGooglePlace> = {}): SelectedGooglePlace {
  return {
    placeId: id, formattedAddress: `1 Main St (${id})`, latitude: 43.7, longitude: -79.4,
    city: 'Toronto', province: 'Ontario', countryCode: 'CA', ...extra,
  };
}

function quoteBody(overrides: Partial<DeliveryRouteQuote> = {}): DeliveryRouteQuote {
  return {
    eligible: true, pickup_city: 'Toronto', pickup_zone_id: 'z1', pickup_zone_name: 'GTA',
    delivery_city: 'Toronto', delivery_zone_id: 'z1', delivery_zone_name: 'GTA',
    distance_meters: 12000, distance_km: 12, duration_seconds: 600, radius_km: 30,
    extra_distance_km: 0, base_price: 400, additional_per_km: 5, distance_charge: 0,
    applied_charges: [], delivery_fee: 400, gst_rate: 5, pst_rate: 8, quote_id: 'q1',
    ...overrides,
  };
}

function ready(change: (value: NewOrderFormValue) => void = () => undefined): NewOrderFormValue {
  const value = createDefaultNewOrder();
  value.pickup.location = place('P1');
  value.delivery.location = place('P2');
  value.deliveryCategoryId = 'cat-1';
  change(value);
  return value;
}

function setup() {
  TestBed.configureTestingModule({
    providers: [OrderQuoteService, provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(OrderQuoteService);
  const http = TestBed.inject(HttpTestingController);
  const results: QuoteResult[] = [];
  service.results$.subscribe((result) => results.push(result));
  return { service, http, results };
}

const requests = (http: HttpTestingController): TestRequest[] => http.match((req) => req.url === QUOTE_URL);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('canQuote', () => {
  it('needs both places and a category', () => {
    expect(canQuote(ready())).toBe(true);
    expect(canQuote(ready((v) => (v.pickup.location = null)))).toBe(false);
    expect(canQuote(ready((v) => (v.delivery.location = null)))).toBe(false);
    expect(canQuote(ready((v) => (v.deliveryCategoryId = '')))).toBe(false);
  });
});

describe('OrderQuoteService asking for a quote', () => {
  it('waits for the pause, then asks once', () => {
    const { service, http } = setup();
    service.request(ready(), false);

    expect(service.isQuoting).toBe(true);
    jest.advanceTimersByTime(QUOTE_PAUSE_MS - 1);
    expect(requests(http)).toHaveLength(0);

    jest.advanceTimersByTime(1);
    const sent = requests(http);
    expect(sent).toHaveLength(1);
    expect(sent[0].request.body).toMatchObject({ pickup_place_id: 'P1', delivery_place_id: 'P2', delivery_category_id: 'cat-1' });
  });

  it('asks at once when told not to wait', () => {
    const { service, http } = setup();
    service.request(ready(), true);

    expect(requests(http)).toHaveLength(1);
  });

  it('asks only for the newest of several quick requests', () => {
    const { service, http } = setup();
    service.request(ready((v) => (v.deliveryCategoryId = 'a')), false);
    jest.advanceTimersByTime(100);
    service.request(ready((v) => (v.deliveryCategoryId = 'b')), false);
    jest.advanceTimersByTime(QUOTE_PAUSE_MS);

    const sent = requests(http);
    expect(sent).toHaveLength(1);
    expect(sent[0].request.body.delivery_category_id).toBe('b');
  });

  it('sends the browser place details, and none for a manual address', () => {
    const { service, http } = setup();
    service.request(ready((v) => (v.delivery.location = place('manual:z1', { manual: true }))), true);

    const body = requests(http)[0].request.body;
    expect(body.pickup_place).toMatchObject({ place_id: 'P1', city: 'Toronto', province: 'Ontario', country_code: 'CA' });
    expect(body.delivery_place).toBeNull();
  });

  it('sends the delivery time as specified, or as a date only, or not at all', () => {
    const { service, http } = setup();
    const body = (change: (v: NewOrderFormValue) => void) => {
      service.request(ready(change), true);
      return requests(http)[0].request.body;
    };

    const timed = body((v) => { v.delivery.deliveryDate = '2026-10-05'; v.delivery.deliveryTimeSpecified = true; v.delivery.deliveryTime = '14:30'; });
    expect([timed.delivery_planned_at, timed.delivery_time_specified]).toEqual(['2026-10-05T14:30:00', true]);

    const dated = body((v) => { v.delivery.deliveryDate = '2026-10-05'; v.delivery.deliveryTimeSpecified = false; });
    expect([dated.delivery_planned_at, dated.delivery_time_specified]).toEqual(['2026-10-05T00:00:00', false]);

    const none = body((v) => { v.delivery.deliveryDate = ''; });
    expect([none.delivery_planned_at, none.delivery_time_specified]).toEqual([null, false]);
  });
});

describe('OrderQuoteService answers', () => {
  it('hands on the quote and stops quoting', () => {
    const { service, http, results } = setup();
    service.request(ready(), true);
    requests(http)[0].flush(quoteBody());

    expect(results).toEqual([{ quote: quoteBody() }]);
    expect(service.isQuoting).toBe(false);
    expect(service.error).toBe('');
  });

  it("shows the server's message when the quote fails", () => {
    const { service, http, results } = setup();
    service.request(ready(), true);
    requests(http)[0].flush({ detail: 'No price is set.' }, { status: 422, statusText: 'error' });

    expect(service.error).toBe('No price is set.');
    expect(service.isQuoting).toBe(false);
    expect(results).toHaveLength(1);
    expect((results[0] as { error: unknown }).error).toBeInstanceOf(HttpErrorResponse);
  });

  it('shows a generic message when the server gives none', () => {
    const { service, http } = setup();
    service.request(ready(), true);
    requests(http)[0].flush('', { status: 500, statusText: 'error' });

    expect(service.error).toBe('Unable to validate this delivery route.');
  });

  it('clears the message when the next request starts', () => {
    const { service, http } = setup();
    service.request(ready(), true);
    requests(http)[0].flush('', { status: 500, statusText: 'error' });
    service.request(ready(), true);

    expect(service.error).toBe('');
  });
});

describe('OrderQuoteService the quote lock', () => {
  it('sends the last quote id with the next request', () => {
    const { service, http } = setup();
    service.request(ready(), true);
    const [first] = requests(http);
    expect(first.request.body.quote_id).toBeNull();
    first.flush(quoteBody({ quote_id: 'q1' }));

    service.request(ready(), true);
    expect(requests(http)[0].request.body.quote_id).toBe('q1');
  });

  it('forgets the id after a failed quote', () => {
    const { service, http } = setup();
    service.request(ready(), true);
    requests(http)[0].flush(quoteBody({ quote_id: 'q1' }));
    service.request(ready(), true);
    requests(http)[0].flush('', { status: 500, statusText: 'error' });

    service.request(ready(), true);
    expect(requests(http)[0].request.body.quote_id).toBeNull();
  });

  it('forgets the id when cancelled', () => {
    const { service, http } = setup();
    service.request(ready(), true);
    requests(http)[0].flush(quoteBody({ quote_id: 'q1' }));
    service.cancel();

    service.request(ready(), true);
    expect(requests(http)[0].request.body.quote_id).toBeNull();
  });
});

describe('OrderQuoteService cancelling', () => {
  it('never sends a quote that was still waiting', () => {
    const { service, http } = setup();
    service.request(ready(), false);
    jest.advanceTimersByTime(200);
    service.cancel();
    jest.advanceTimersByTime(1000);

    expect(requests(http)).toHaveLength(0);
    expect(service.isQuoting).toBe(false);
  });

  it('cancels a request already in flight', () => {
    const { service, http, results } = setup();
    service.request(ready(), true);
    const inFlight = requests(http)[0];
    service.cancel();

    expect(inFlight.cancelled).toBe(true);
    expect(results).toEqual([]);
  });

  it('cancels the request in flight when a newer one starts, and ignores its answer', () => {
    const { service, http, results } = setup();
    service.request(ready((v) => (v.deliveryCategoryId = 'a')), true);
    const older = requests(http)[0];
    service.request(ready((v) => (v.deliveryCategoryId = 'b')), true);
    const newer = requests(http)[0];

    expect(older.cancelled).toBe(true);
    newer.flush(quoteBody({ quote_id: 'new' }));
    expect(results).toEqual([{ quote: quoteBody({ quote_id: 'new' }) }]);
  });

  it('clears an old message', () => {
    const { service, http } = setup();
    service.request(ready(), true);
    requests(http)[0].flush('', { status: 500, statusText: 'error' });
    service.cancel();

    expect(service.error).toBe('');
  });

  it('sends nothing after the service is destroyed', () => {
    const { service, http } = setup();
    service.request(ready(), false);
    service.ngOnDestroy();
    jest.advanceTimersByTime(1000);

    expect(requests(http)).toHaveLength(0);
  });
});
