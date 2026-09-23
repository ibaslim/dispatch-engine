import { OrderTab } from '@models/orders/order-entity.model';
import { PaymentMethodType } from '@models/new-order-form/new-order-form.model';
import { AutomaticOffer, Discount, DiscountReason } from '@services/discounts/discounts.service';
import { toNumber } from './orders-mapping.util';

export { toNumber };

export const DISCOUNT_REASON_LABELS: Record<DiscountReason, string> = {
  late_delivery: 'Late delivery',
  damaged_item: 'Damaged item',
  wrong_address_our_fault: 'Wrong address (our fault)',
  sales_goodwill: 'Sales goodwill',
  price_correction: 'Price correction',
  other: 'Other',
};

export const DISCOUNT_KIND_LABELS: Record<string, string> = {
  percentage: 'Percentage off',
  fixed_amount: 'Fixed amount off',
};

/** How a discount reads in a list: "10% off", "C$ 5.00 off", "C$ 6.99 delivery". */
export function discountTerms(discount: Discount): string {
  if (discount.value_mode === 'entered') {
    return discount.kind === 'percentage' ? 'Percentage you enter' : 'Amount you enter';
  }
  const value = toNumber(discount.value);
  if (discount.kind === 'percentage') {
    const cap = discount.max_discount_amount
      ? `, max C$ ${toNumber(discount.max_discount_amount).toFixed(2)}`
      : '';
    return `${value}% off${cap}`;
  }
  return `C$ ${value.toFixed(2)} off`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The value to price with: what was typed on the order, else the discount's own. */
export function discountValue(discount: Discount, entered?: string | number | null): number {
  if (discount.value_mode === 'entered') return toNumber(entered);
  return toNumber(discount.value);
}

/** What one discount takes off what is left of the fee. Mirrors the server. */
export function discountAmount(
  discount: Discount,
  remaining: number,
  entered?: string | number | null,
): number {
  const left = round2(Math.max(0, toNumber(remaining)));
  if (left <= 0) return 0;
  if (discount.min_gross_fee !== null && left < toNumber(discount.min_gross_fee)) return 0;

  const value = discountValue(discount, entered);
  if (value <= 0) return 0;
  let amount: number;
  if (discount.kind === 'percentage') amount = round2((left * value) / 100);
  else amount = value;

  amount = Math.min(round2(amount), left);
  if (discount.max_discount_amount !== null) {
    amount = Math.min(amount, round2(toNumber(discount.max_discount_amount)));
  }
  amount = Math.min(amount, Math.max(0, left - round2(toNumber(discount.min_net_fee))));
  return Math.max(0, round2(amount));
}

/** A discount chosen on the order, with the value typed for it if it needs one. */
export interface DiscountPick {
  discount: Discount;
  value: string;
}

/** Each selected discount priced in turn, the way the server will price them. */
export function priceDiscounts(
  picks: DiscountPick[],
  deliveryFees: number,
): { discount: Discount; amount: number }[] {
  let remaining = round2(Math.max(0, toNumber(deliveryFees)));
  const priced: { discount: Discount; amount: number }[] = [];
  for (const pick of picks) {
    const amount = discountAmount(pick.discount, remaining, pick.value);
    if (amount <= 0) continue;
    priced.push({ discount: pick.discount, amount });
    remaining = round2(remaining - amount);
  }
  return priced;
}

export function discountTotal(picks: DiscountPick[], deliveryFees: number): number {
  return round2(
    priceDiscounts(picks, deliveryFees).reduce((sum, line) => sum + line.amount, 0),
  );
}

/**
 * What the automatic discount takes off. The server picked the winner; this only
 * honours an opt-out made since, and never exceeds the fee it comes off.
 */
export function automaticAmount(
  offers: AutomaticOffer[] | undefined,
  optedOut: string[] | undefined,
  deliveryFees: number,
): number {
  const skipped = new Set(optedOut || []);
  const total = (offers || [])
    .filter((offer) => offer.state === 'applied' && !skipped.has(offer.discount.id))
    .reduce((sum, offer) => sum + toNumber(offer.amount), 0);
  return Math.min(round2(total), round2(Math.max(0, toNumber(deliveryFees))));
}

/** What a checked coupon code takes off, on what the automatic discount left. */
export function couponAmount(
  couponDiscount: Discount | null | undefined,
  deliveryFees: number,
  automaticTaken: number,
): number {
  if (!couponDiscount) return 0;
  const remaining = round2(Math.max(0, toNumber(deliveryFees) - automaticTaken));
  return discountAmount(couponDiscount, remaining);
}

/** Everything coming off the fee: automatic, then a checked coupon, then hand-picked ones. */
export function totalDiscount(
  picks: DiscountPick[],
  deliveryFees: number,
  offers: AutomaticOffer[] | undefined,
  optedOut: string[] | undefined,
  couponDiscount?: Discount | null,
): number {
  const automatic = automaticAmount(offers, optedOut, deliveryFees);
  const coupon = couponAmount(couponDiscount, deliveryFees, automatic);
  return round2(
    automatic + coupon + discountTotal(picks, toNumber(deliveryFees) - automatic - coupon),
  );
}

// ─── Pure display/formatting helpers extracted from OrdersComponent ──────────
// No Angular dependencies; safe to call directly from templates or services.

export function money(amount: number): string {
  return `C$ ${toNumber(amount).toFixed(2)}`;
}

export function formatStatusLabel(status: OrderTab): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function driverEarningsLabel(payout: unknown): string {
  return money(toNumber(payout));
}

export function truncateWords(text: string, wordLimit: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= wordLimit) return text;
  return `${words.slice(0, wordLimit).join(' ')}...`;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function maskCard(card: string = ''): string {
  if (!card) return '';
  return card.replace(/\d(?=\d{4})/g, '*');
}

export function formatPaymentMethod(method: PaymentMethodType): string {
  return method === 'credit_card' ? 'Credit card' : 'Cash on delivery';
}

export function formatTime(time: string): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const period = hours >= 12 ? 'pm' : 'am';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${period}`;
}

export function parseDateTime(dateStr: string, time: string): Date | null {
  if (!dateStr || !time) return null;
  const value = new Date(`${dateStr}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function formatDateTime(dateStr: string, time: string): string {
  // Date-only stop: show the day without inventing a time.
  if (dateStr && !time) {
    const day = parseDateTime(dateStr, '00:00');
    return day ? `${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, any time` : dateStr;
  }
  const parsed = parseDateTime(dateStr, time);
  if (!parsed) return formatTime(time);
  return `${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${formatTime(time)}`;
}

// ─── Tax breakdown ──────────────────────────────────────────────────────────

export interface TaxLine {
  /** "GST" or "PST". */
  name: string;
  rate: number;
  amount: number;
  /** "GST (5%)" — the label as it appears on a receipt. */
  label: string;
}

interface TaxSource {
  gstRate?: number;
  gstAmount?: number;
  pstRate?: number;
  pstAmount?: number;
}

/** Trims trailing zeros so 5 reads "5" and Quebec's 9.975 keeps its decimals. */
export function formatRate(rate: number): string {
  return String(Number(toNumber(rate).toFixed(3)));
}

function taxLine(name: string, rate: unknown, amount: unknown): TaxLine | null {
  const parsedRate = toNumber(rate);
  const parsedAmount = toNumber(amount);
  if (!parsedRate && !parsedAmount) return null;
  return {
    name,
    rate: parsedRate,
    amount: parsedAmount,
    label: `${name} (${formatRate(parsedRate)}%)`,
  };
}

/** Tax rows for a receipt: GST and PST separately, each omitted when it is zero. */
export function taxLines(details: TaxSource): TaxLine[] {
  return [
    taxLine('GST', details.gstRate, details.gstAmount),
    taxLine('PST', details.pstRate, details.pstAmount),
  ].filter((line): line is TaxLine => line !== null);
}
