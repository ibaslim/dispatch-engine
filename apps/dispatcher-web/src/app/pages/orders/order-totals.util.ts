function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Tax on a subtotal, to the cent. Done in whole cents and thousandths of a percent so it
 * matches the server exactly: it rounds a half cent to the even cent, not up.
 */
export function taxAmount(subtotal: number, ratePercent: number): number {
  const cents = Math.round(subtotal * 100);
  const thousandths = Math.round(ratePercent * 1000);
  const scaled = cents * thousandths;
  const whole = Math.floor(scaled / 100000);
  const remainder = scaled - whole * 100000;
  const roundUp = remainder > 50000 || (remainder === 50000 && whole % 2 === 1);
  return (roundUp ? whole + 1 : whole) / 100;
}

export interface OrderTotalParts {
  subtotal: number;
  gstAmount: number;
  pstAmount: number;
  deliveryFees: number;
  deliveryTips: number;
  discount: number;
}

/** What the customer pays: everything added, less the discount. */
export function orderTotal(parts: OrderTotalParts): number {
  return round2(
    parts.subtotal + parts.gstAmount + parts.pstAmount + parts.deliveryFees + parts.deliveryTips - parts.discount,
  );
}
