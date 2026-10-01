import { orderTotal, taxAmount } from './order-totals.util';

describe('taxAmount', () => {
  // Expected values are what the server saves: Decimal(subtotal) * rate / 100, quantized to cents.
  it.each([
    [33.33, 5, 1.67],
    [33.33, 8, 2.67],
    [12.34, 9.975, 1.23],
    [100, 5, 5],
    [0, 13, 0],
    [19.99, 0, 0],
  ])('subtotal %s at %s%% is %s', (subtotal, rate, expected) => {
    expect(taxAmount(subtotal, rate)).toBe(expected);
  });

  // A half cent goes to the even cent on the server, where plain rounding would go up.
  it.each([
    [10.1, 5, 0.5],
    [0.1, 5, 0],
    [0.3, 5, 0.02],
    [2.5, 5, 0.12],
    [1.16, 12.5, 0.14],
    [4.1, 15, 0.62],
  ])('rounds the half cent of %s at %s%% to %s, like the server', (subtotal, rate, expected) => {
    expect(taxAmount(subtotal, rate)).toBe(expected);
  });
});

describe('orderTotal', () => {
  const parts = { subtotal: 100, gstAmount: 5, pstAmount: 8, deliveryFees: 400, deliveryTips: 10, discount: 0 };

  it('adds the subtotal, both taxes, the fee and the tip', () => {
    expect(orderTotal(parts)).toBe(523);
  });

  it('takes the discount off', () => {
    expect(orderTotal({ ...parts, discount: 40 })).toBe(483);
  });

  it('rounds to cents', () => {
    expect(orderTotal({ ...parts, subtotal: 33.33, gstAmount: 1.67, pstAmount: 2.67, deliveryFees: 0.1, deliveryTips: 0 })).toBe(37.77);
  });
});
