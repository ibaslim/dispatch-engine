import type { AutomaticOffer, Discount } from '@services/discounts/discounts.service';
import {
  automaticAmount,
  couponAmount,
  discountAmount,
  priceDiscounts,
  totalDiscount,
} from './orders-formatting.util';

function discount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd1',
    title: 'Ten off',
    public_label: 'Ten off',
    description: null,
    discount_type_id: null,
    discount_type_title: null,
    kind: 'percentage',
    value_mode: 'fixed',
    value: 10,
    max_discount_amount: null,
    min_gross_fee: null,
    min_net_fee: 0,
    ...overrides,
  } as Discount;
}

function offer(id: string, amount: number, state: AutomaticOffer['state'] = 'applied'): AutomaticOffer {
  return { discount: discount({ id }), amount, state };
}

describe('discountAmount', () => {
  it('takes a percentage off the fee that is left', () => {
    expect(discountAmount(discount({ value: 10 }), 400)).toBe(40);
  });

  it('never takes more than the fee that is left', () => {
    expect(discountAmount(discount({ kind: 'fixed_amount', value: 5 }), 3)).toBe(3);
  });

  it('stops at the discount cap', () => {
    expect(discountAmount(discount({ value: 10, max_discount_amount: 25 }), 400)).toBe(25);
  });

  it('gives nothing when the fee is below the minimum gross fee', () => {
    expect(discountAmount(discount({ min_gross_fee: 100 }), 50)).toBe(0);
  });

  it('leaves the minimum net fee in place', () => {
    expect(discountAmount(discount({ kind: 'fixed_amount', value: 50, min_net_fee: 10 }), 40)).toBe(30);
  });

  it('uses the value typed on the order when the discount asks for one', () => {
    const entered = discount({ value_mode: 'entered', value: null });
    expect(discountAmount(entered, 200, '15')).toBe(30);
    expect(discountAmount(entered, 200, '')).toBe(0);
  });

  it('gives nothing when no fee is left', () => {
    expect(discountAmount(discount(), 0)).toBe(0);
  });

  it('rounds to cents', () => {
    expect(discountAmount(discount({ value: 7.5 }), 33.33)).toBe(2.5);
  });
});

describe('priceDiscounts', () => {
  it('prices each pick on what the previous ones left', () => {
    const picks = [
      { discount: discount({ id: 'a', value: 20 }), value: '' },
      { discount: discount({ id: 'b', kind: 'fixed_amount', value: 30 }), value: '' },
    ];
    expect(priceDiscounts(picks, 100).map((line) => line.amount)).toEqual([20, 30]);
  });

  it('caps a later pick at what is left and skips picks worth nothing', () => {
    const picks = [
      { discount: discount({ id: 'a', kind: 'fixed_amount', value: 90 }), value: '' },
      { discount: discount({ id: 'b', kind: 'fixed_amount', value: 50 }), value: '' },
      { discount: discount({ id: 'c', kind: 'fixed_amount', value: 5 }), value: '' },
    ];
    expect(priceDiscounts(picks, 100).map((line) => [line.discount.id, line.amount])).toEqual([
      ['a', 90],
      ['b', 10],
    ]);
  });
});

describe('automaticAmount', () => {
  it('adds up the applied offers', () => {
    expect(automaticAmount([offer('a', 7.5), offer('b', 4)], [], 100)).toBe(11.5);
  });

  it('ignores offers that were opted out, outranked or are waiting', () => {
    const offers = [offer('a', 7.5), offer('b', 4, 'outranked'), offer('c', 3, 'waiting'), offer('d', 2, 'opted_out')];
    expect(automaticAmount(offers, [], 100)).toBe(7.5);
  });

  it('honours an opt-out made since the offers were fetched', () => {
    expect(automaticAmount([offer('a', 7.5), offer('b', 4)], ['a'], 100)).toBe(4);
  });

  it('never takes more than the fee', () => {
    expect(automaticAmount([offer('a', 12)], [], 10)).toBe(10);
  });
});

describe('couponAmount', () => {
  it('prices the coupon on what the automatic discount left', () => {
    expect(couponAmount(discount({ value: 10 }), 100, 20)).toBe(8);
  });

  it('is zero without a checked coupon', () => {
    expect(couponAmount(null, 100, 0)).toBe(0);
  });
});

describe('totalDiscount', () => {
  it('takes the automatic discount first, then the coupon, then hand-picked ones', () => {
    const picks = [{ discount: discount({ id: 'p', kind: 'fixed_amount', value: 5 }), value: '' }];
    const coupon = discount({ id: 'c', value: 10 });
    // 100 fee: automatic 20 -> 80 left; coupon 10% of 80 = 8 -> 72 left; pick 5.
    expect(totalDiscount(picks, 100, [offer('a', 20)], [], coupon)).toBe(33);
  });

  it('is zero with nothing selected', () => {
    expect(totalDiscount([], 100, [], [], null)).toBe(0);
  });
});
