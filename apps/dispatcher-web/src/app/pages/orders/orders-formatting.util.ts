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

export function driverEarningsLabel(total: unknown): string {
  return money(Math.round(toNumber(total) * 0.05 * 100) / 100);
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
