import { Injectable, OnDestroy } from '@angular/core';
import { EMPTY, Observable, Subject, Subscription, catchError, defer, map, of, switchMap, timer } from 'rxjs';

import { apiErrorMessage } from '../../core/http/api-error.util';
import type { DeliveryRouteQuote, NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import type { SelectedGooglePlace } from '../../services/google-maps/google-maps.service';
import { OrdersService, QuotePlace } from '../../services/orders/orders.service';
import { deliveryPlannedAt } from '@pages/orders/orders-mapping.util';

/** How long changes must stop before the form asks for a quote. */
export const QUOTE_PAUSE_MS = 400;

export type QuoteResult = { quote: DeliveryRouteQuote } | { error: unknown };
type Trigger = { value: NewOrderFormValue; immediate: boolean } | null;

/** A quote needs both places and a category. */
export function canQuote(value: NewOrderFormValue): boolean {
  return !!(value.pickup.location && value.delivery.location && value.deliveryCategoryId);
}

/**
 * Gets the delivery quote for one order form. Provided by the form itself, so every open
 * form has its own quote state. A newer request replaces one that is waiting or in flight.
 */
@Injectable()
export class OrderQuoteService implements OnDestroy {
  /** True from a request until its answer arrives, or until it is cancelled. */
  isQuoting = false;
  /** What to tell the dispatcher about the last quote; cleared when a new request starts. */
  error = '';
  /** Every answer that was not replaced by a newer request. */
  readonly results$: Observable<QuoteResult>;

  // The last quote's lock; the server reuses its route while the addresses stay the same.
  private lastQuoteId: string | null = null;
  private readonly trigger$ = new Subject<Trigger>();
  private readonly results = new Subject<QuoteResult>();
  private readonly subscription: Subscription;

  constructor(private readonly orders: OrdersService) {
    this.results$ = this.results.asObservable();
    this.subscription = this.trigger$
      .pipe(switchMap((trigger) => (trigger ? this.fetch(trigger.value, trigger.immediate) : EMPTY)))
      .subscribe((result) => this.settle(result));
  }

  /** Quote after a pause, or at once. */
  request(value: NewOrderFormValue, immediate: boolean): void {
    this.isQuoting = true;
    this.trigger$.next({ value, immediate });
  }

  /** Drop any waiting or in-flight quote, and the lock, because the inputs are gone. */
  cancel(): void {
    this.trigger$.next(null);
    this.lastQuoteId = null;
    this.isQuoting = false;
    this.error = '';
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.results.complete();
  }

  private fetch(value: NewOrderFormValue, immediate: boolean): Observable<QuoteResult> {
    const wait: Observable<unknown> = immediate ? of(null) : timer(QUOTE_PAUSE_MS);
    return wait.pipe(
      switchMap(() => {
        this.error = '';
        return defer(() => this.orders.quoteDelivery(this.body(value))).pipe(
          map((quote): QuoteResult => ({ quote })),
          catchError((error: unknown) => of<QuoteResult>({ error })),
        );
      }),
    );
  }

  private settle(result: QuoteResult): void {
    this.isQuoting = false;
    if ('quote' in result) {
      this.lastQuoteId = result.quote.quote_id ?? null;
    } else {
      this.lastQuoteId = null;
      this.error = apiErrorMessage(result.error, 'Unable to validate this delivery route.');
    }
    this.results.next(result);
  }

  private body(value: NewOrderFormValue): Parameters<OrdersService['quoteDelivery']>[0] {
    const delivery = value.delivery.deliveryDate ? deliveryPlannedAt(value.delivery) : null;
    return {
      pickup_place_id: value.pickup.location!.placeId,
      delivery_place_id: value.delivery.location!.placeId,
      delivery_category_id: value.deliveryCategoryId,
      delivery_planned_at: delivery?.plannedAt ?? null,
      delivery_time_specified: delivery?.timeSpecified ?? false,
      surcharge_ids: value.surchargeIds,
      pickup_address: value.pickup.address,
      delivery_address: value.delivery.address,
      quote_id: this.lastQuoteId,
      pickup_place: this.place(value.pickup.location),
      delivery_place: this.place(value.delivery.location),
    };
  }

  /** The browser's place details for the server, or null when a lookup is still needed. */
  private place(place: SelectedGooglePlace | null): QuotePlace | null {
    if (!place || place.manual || !place.city || !place.province || !place.countryCode) return null;
    return {
      place_id: place.placeId,
      formatted_address: place.formattedAddress,
      latitude: place.latitude,
      longitude: place.longitude,
      city: place.city,
      province: place.province,
      country_code: place.countryCode,
    };
  }
}
