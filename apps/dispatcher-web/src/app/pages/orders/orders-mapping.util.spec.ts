import type { DeliveryRouteQuote, NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import type { AppliedDiscount } from '@dispatch/shared/contracts';
import { appliedDiscountSelections, createDefaultNewOrder, toOrderPayload } from './orders-mapping.util';

function quote(overrides: Partial<DeliveryRouteQuote> = {}): DeliveryRouteQuote {
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
    ...overrides,
  };
}

function order(changes: (value: NewOrderFormValue) => void = () => undefined): NewOrderFormValue {
  const value = createDefaultNewOrder();
  value.delivery.deliveryDate = '2026-10-05';
  changes(value);
  return value;
}

describe('toOrderPayload: the locked quote', () => {
  it('sends the quote id and the fee the form showed', () => {
    const payload = toOrderPayload(order((v) => (v.routeQuote = quote({ quote_id: 'q1', delivery_fee: 427.5 }))));
    expect(payload['quote_id']).toBe('q1');
    expect(payload['quoted_delivery_fee']).toBe(427.5);
  });

  it('sends neither for a quote without an id, such as a reopened order placeholder', () => {
    const payload = toOrderPayload(order((v) => (v.routeQuote = quote())));
    expect('quote_id' in payload).toBe(false);
    expect('quoted_delivery_fee' in payload).toBe(false);
  });

  it('sends neither when there is no quote', () => {
    const payload = toOrderPayload(order());
    expect('quote_id' in payload).toBe(false);
  });
});

describe('toOrderPayload: the delivery schedule', () => {
  it('sends a date-only delivery at midnight, not time-specified', () => {
    const payload = toOrderPayload(order());
    expect(payload['delivery_planned_at']).toBe('2026-10-05T00:00:00');
    expect(payload['delivery_time_specified']).toBe(false);
  });

  it('sends a ticked delivery time as specified', () => {
    const payload = toOrderPayload(order((v) => {
      v.delivery.deliveryTimeSpecified = true;
      v.delivery.deliveryTime = '14:30';
    }));
    expect(payload['delivery_planned_at']).toBe('2026-10-05T14:30:00');
    expect(payload['delivery_time_specified']).toBe(true);
  });

  it('ignores a typed time while the box is not ticked', () => {
    const payload = toOrderPayload(order((v) => {
      v.delivery.deliveryTimeSpecified = false;
      v.delivery.deliveryTime = '14:30';
    }));
    expect(payload['delivery_planned_at']).toBe('2026-10-05T00:00:00');
  });
});

describe('toOrderPayload: money and items', () => {
  it('sends the category as null while none is chosen', () => {
    expect(toOrderPayload(order())['delivery_category_id']).toBeNull();
  });

  it('keeps an item without a price as a null price and drops one without a quantity', () => {
    const payload = toOrderPayload(order((v) => {
      v.details.items = [
        { itemName: 'Letter', itemPrice: '', itemQty: '1' },
        { itemName: 'Box', itemPrice: '12.5', itemQty: '2' },
        { itemName: 'Nothing', itemPrice: '9', itemQty: '' },
      ];
    }));
    expect(payload['items']).toEqual([
      { itemName: 'Letter', itemPrice: null, itemQty: 1 },
      { itemName: 'Box', itemPrice: 12.5, itemQty: 2 },
    ]);
  });

  it('sends the totals the form worked out', () => {
    const payload = toOrderPayload(order((v) => {
      v.details.subtotal = 100;
      v.details.gstRate = 5;
      v.details.gstAmount = 5;
      v.details.deliveryFees = 400;
      v.details.total = 505;
    }));
    expect([payload['subtotal'], payload['gst_amount'], payload['delivery_fees'], payload['total']]).toEqual([
      100, 5, 400, 505,
    ]);
  });
});

function line(overrides: Partial<AppliedDiscount> = {}): AppliedDiscount {
  return {
    discount_id: 'd1', source: 'manual', kind: 'percentage', label: 'Goodwill', value: 10,
    amount: 40, reason: null, note: null, applied_by: null, ...overrides,
  };
}

describe('appliedDiscountSelections', () => {
  it('carries a hand-picked discount back with the value it was given', () => {
    expect(appliedDiscountSelections([line({ discount_id: 'a', value: 15 })])).toEqual([
      { discountId: 'a', value: '15' },
    ]);
  });

  it('leaves out an automatic discount, which the server decides again on every save', () => {
    expect(appliedDiscountSelections([line({ discount_id: 'auto', source: 'automatic' })])).toEqual([]);
  });

  it('leaves out a discount a coupon code unlocked, which the code brings back by itself', () => {
    expect(appliedDiscountSelections([line({ discount_id: 'coupon', source: 'code' })])).toEqual([]);
  });

  it('keeps only the hand-picked ones when an order has all three kinds', () => {
    const lines = [
      line({ discount_id: 'auto', source: 'automatic' }),
      line({ discount_id: 'coupon', source: 'code' }),
      line({ discount_id: 'mine', source: 'manual', value: 5 }),
    ];
    expect(appliedDiscountSelections(lines)).toEqual([{ discountId: 'mine', value: '5' }]);
  });

  it('treats a line saved before sources existed as hand-picked, as the server does', () => {
    const legacy = { ...line({ discount_id: 'old' }), source: undefined } as unknown as AppliedDiscount;
    expect(appliedDiscountSelections([legacy])).toEqual([{ discountId: 'old', value: '10' }]);
  });

  it('skips a line with no discount behind it, and gives a blank value when there is none', () => {
    const lines = [line({ discount_id: null }), line({ discount_id: 'free', value: 0 })];
    expect(appliedDiscountSelections(lines)).toEqual([{ discountId: 'free', value: '' }]);
  });

  it('gives nothing for an order without discounts', () => {
    expect(appliedDiscountSelections(undefined)).toEqual([]);
  });
});
