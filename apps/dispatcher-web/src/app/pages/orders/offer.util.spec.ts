import type { DriverOrder } from '@dispatch/shared/contracts';
import { formatTrip, offerCountdownLabel, OFFER_WINDOW_SECONDS, toOfferCard } from './offer.util';

function order(overrides: Partial<DriverOrder> = {}): DriverOrder {
  return {
    id: 'order-1',
    order_number: 'ORD15092601',
    pickup_name: 'Maple Bakery',
    pickup_address: '1420 Robson St, Vancouver',
    pickup_planned_at: '2026-09-20T14:30:00',
    pickup_time_specified: true,
    delivery_name: 'Sam Lee',
    delivery_address: '305 Hastings St, Burnaby',
    delivery_planned_at: '2026-09-20T00:00:00',
    delivery_time_specified: false,
    driver_payout: 18.5,
    driver_fee_payout: 15,
    driver_tip_payout: 3.5,
    route_distance_meters: 12400,
    route_duration_seconds: 1080,
    items: [{ itemName: 'Cake box', itemQty: 2 }],
    instructions: 'Ring twice.',
    published_at: '2026-09-15T10:00:00Z',
    ...overrides,
  } as DriverOrder;
}

describe('toOfferCard', () => {
  it('shows a specific pickup time and a date-only drop', () => {
    const card = toOfferCard(order(), Date.parse('2026-09-15T10:00:00Z'));

    expect(card.pickupWhen).toBe('Sep 20, 2:30pm');
    expect(card.pickupTimeSpecified).toBe(true);
    expect(card.deliveryWhen).toBe('Sep 20, any time');
    expect(card.deliveryTimeSpecified).toBe(false);
  });

  it('counts down from the publish time', () => {
    const fiveMinutesLater = Date.parse('2026-09-15T10:05:00Z');

    expect(toOfferCard(order(), fiveMinutesLater).remainingSeconds).toBe(OFFER_WINDOW_SECONDS - 300);
  });

  it('never goes below zero once the window has closed', () => {
    const anHourLater = Date.parse('2026-09-15T11:00:00Z');

    expect(toOfferCard(order(), anHourLater).remainingSeconds).toBe(0);
  });

  it('carries the earnings breakdown, items and instructions for the details view', () => {
    const card = toOfferCard(order(), Date.parse('2026-09-15T10:00:00Z'));

    expect([card.driverFee, card.feePayout, card.tipPayout]).toEqual([18.5, 15, 3.5]);
    expect(card.items).toEqual([{ name: 'Cake box', qty: 2 }]);
    expect(card.instructions).toBe('Ring twice.');
  });
});

describe('offer formatting', () => {
  it('formats the countdown as mm:ss', () => {
    expect(offerCountdownLabel(605)).toBe('10:05');
  });

  it('describes the trip as time over distance', () => {
    expect(formatTrip(12400, 1080)).toBe('18 min over 12.4 km');
  });

  it('shows whichever half of the trip is known', () => {
    expect(formatTrip(null, 5400)).toBe('1 h 30 min');
    expect(formatTrip(640, null)).toBe('640 m');
    expect(formatTrip(null, null)).toBeNull();
  });
});
