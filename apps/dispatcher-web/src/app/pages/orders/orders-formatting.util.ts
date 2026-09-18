import { OrderTab } from '@models/orders/order-entity.model';
import {
  ManualDiscountReason,
  ManualDiscountValue,
  PaymentMethodType,
} from '@models/new-order-form/new-order-form.model';
import { toNumber } from './orders-mapping.util';

export { toNumber };

export const MANUAL_DISCOUNT_REASONS: { value: ManualDiscountReason; label: string }[] = [
  { value: 'late_delivery', label: 'Late delivery' },
  { value: 'damaged_item', label: 'Damaged item' },
  { value: 'wrong_address_our_fault', label: 'Wrong address (our fault)' },
  { value: 'sales_goodwill', label: 'Sales goodwill' },
  { value: 'price_correction', label: 'Price correction' },
  { value: 'other', label: 'Other' },
];

/** What a manual discount takes off the fee. Mirrors the server, which decides. */
export function manualDiscountAmount(
  manual: ManualDiscountValue | null | undefined,
  deliveryFees: number,
): number {
  if (!manual) return 0;
  const fee = Math.max(0, Math.round(toNumber(deliveryFees) * 100) / 100);
  const value = toNumber(manual.value);
  if (value <= 0 || fee <= 0) return 0;
  const raw = manual.kind === 'percentage' ? (fee * value) / 100 : value;
  return Math.min(Math.round(raw * 100) / 100, fee);
}

/** The reason a manual discount can't be saved yet, or null when it is fine. */
export function manualDiscountError(manual: ManualDiscountValue | null | undefined): string | null {
  if (!manual) return null;
  const value = toNumber(manual.value);
  if (!String(manual.value ?? '').trim() || value <= 0) return 'Enter a discount greater than 0.';
  if (manual.kind === 'percentage' && value > 100) return 'A percentage discount cannot be more than 100%.';
  if (!manual.reason) return 'Choose a reason for this discount.';
  if (manual.reason === 'other' && !manual.note.trim()) return 'Add a note explaining this discount.';
  return null;
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
