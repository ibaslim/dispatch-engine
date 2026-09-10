import { OrderTab } from '@models/orders/order-entity.model';
import { PaymentMethodType } from '@models/new-order-form/new-order-form.model';
import { toNumber } from './orders-mapping.util';

export { toNumber };

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
