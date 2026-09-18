import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ManualDiscountKind,
  ManualDiscountReason,
  NewOrderFormValue,
} from '../../models/new-order-form/new-order-form.model';
import { BaseInputComponent } from '../base-input/base-input.component';
import { PaymentMethodComponent } from '../payment-method/payment-method.component';
import { TextareaComponent } from '../textarea/textarea.component';
import { ButtonComponent } from '../button/button.component';
import { DropdownSelectorComponent } from '../dropdown-selector/dropdown-selector.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';
import {
  MANUAL_DISCOUNT_REASONS,
  manualDiscountAmount,
  manualDiscountError,
  taxLines,
} from '@pages/orders/orders-formatting.util';

@Component({
  selector: 'app-other-order-details',
  standalone: true,
  imports: [
    CommonModule,
    BaseInputComponent,
    TextareaComponent,
    PaymentMethodComponent,
    ButtonComponent,
    DropdownSelectorComponent,
    ErrorMessageComponent
  ],
  templateUrl: './other-order-details.component.html'
})
export class OtherOrderDetailsComponent {
  @Input() value!: NewOrderFormValue['details'];
  @Input() routeQuote: NewOrderFormValue['routeQuote'] = null;
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<NewOrderFormValue['details']>();

  itemErrors: { [key: number]: string[] } = {};

  private toNumber(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  trackByIndex(index: number): number {
    return index;
  }

  addItem(): void {
    const items = [...(this.value.items || [])];
    items.push({ itemName: '', itemPrice: '', itemQty: '' });
    this.patch({ items });
  }

  removeItem(index: number): void {
    const items = [...(this.value.items || [])];
    items.splice(index, 1);
    delete this.itemErrors[index];
    this.patch({ items });
  }

  updateItem(index: number, field: string, value: any): void {
    const items = [...(this.value.items || [])];
    let processedValue = value;

    if (field === 'itemPrice' || field === 'itemQty') {
      const strValue = String(value ?? '').trim();

      if (strValue && !/^\d+(\.\d*)?$/.test(strValue)) {
        return;
      }

      processedValue = strValue === '' ? '' : strValue;
    }

    const item = { ...items[index], [field]: processedValue };

    const errors: string[] = [];

    const nameFilled = !!item.itemName?.trim();
    const price = this.toNumber(item.itemPrice);
    const qty = this.toNumber(item.itemQty);
    const priceFilled = item.itemPrice !== '' && item.itemPrice !== null && item.itemPrice !== undefined;
    const qtyFilled = item.itemQty !== '' && item.itemQty !== null && item.itemQty !== undefined;

    if (nameFilled && !priceFilled) errors.push('Price is required');
    if (nameFilled && !qtyFilled) errors.push('Quantity is required');

    if (priceFilled && price <= 0) errors.push('Price must be greater than 0');
    if (qtyFilled && qty <= 0) errors.push('Quantity must be greater than 0');

    this.itemErrors[index] = errors;

    items[index] = item;
    this.patch({ items });
  }

  // ─── Manual discount ──────────────────────────────────────────────────────
  // The dispatcher enters terms, not an amount: the server prices it and caps
  // it at the delivery fee, so goods value, tax and tip are never touched.

  readonly discountReasons = MANUAL_DISCOUNT_REASONS;

  addManualDiscount(): void {
    this.patch({
      manualDiscount: { kind: 'percentage', value: '', reason: 'sales_goodwill', note: '' }
    });
  }

  removeManualDiscount(): void {
    this.patch({ manualDiscount: null });
  }

  patchManualDiscount(change: Partial<NewOrderFormValue['details']['manualDiscount']>): void {
    if (!this.value.manualDiscount) return;
    this.patch({ manualDiscount: { ...this.value.manualDiscount, ...change } });
  }

  setDiscountKind(kind: ManualDiscountKind): void {
    this.patchManualDiscount({ kind });
  }

  setDiscountValue(value: unknown): void {
    const text = String(value ?? '').trim();
    if (text && !/^\d+(\.\d*)?$/.test(text)) return;
    this.patchManualDiscount({ value: text });
  }

  setDiscountReason(reason: unknown): void {
    this.patchManualDiscount({ reason: reason as ManualDiscountReason });
  }

  setDiscountNote(note: unknown): void {
    this.patchManualDiscount({ note: String(note ?? '') });
  }

  discountNoteRequired(): boolean {
    return this.value.manualDiscount?.reason === 'other';
  }

  discountError(): string | null {
    return manualDiscountError(this.value.manualDiscount);
  }

  /** True once the entered terms price to nothing, e.g. before a fee is quoted. */
  discountNotYetPriced(): boolean {
    return !!this.value.manualDiscount && !this.discountError() && this.value.discount <= 0;
  }

  onProofChange(type: 'signature' | 'picture', checked: boolean): void {
    this.patch({
      proofOfDelivery: {
        ...this.value.proofOfDelivery,
        [type]: checked
      }
    });
  }

  getFieldErrors(index: number, type: 'price' | 'qty'): string[] {
    const errors = this.itemErrors[index] || [];

    if (type === 'price') {
      return errors.filter(e => e.toLowerCase().includes('price'));
    }

    if (type === 'qty') {
      return errors.filter(e => e.toLowerCase().includes('quantity'));
    }

    return [];
  }

  private recalc(details: NewOrderFormValue['details']): NewOrderFormValue['details'] {
    const items = details.items || [];

    const subtotal = this.round2(
      items.reduce((sum, item) => {
        const price = this.toNumber(item.itemPrice);
        const qty = this.toNumber(item.itemQty);

        if (!price || !qty) return sum;

        return sum + price * qty;
      }, 0)
    );

    const gstRate = this.toNumber(details.gstRate);
    const pstRate = this.toNumber(details.pstRate);
    const deliveryFees = this.toNumber(details.deliveryFees);
    const deliveryTips = this.toNumber(details.deliveryTips);
    // Previewed the way the server prices it; the saved order is authoritative.
    const discount = manualDiscountAmount(details.manualDiscount, deliveryFees);

    // Each tax is rounded on its own so the receipt's GST and PST lines add up
    // to the tax total exactly, rather than to a separately rounded figure.
    const gstAmount = this.round2((subtotal * gstRate) / 100);
    const pstAmount = this.round2((subtotal * pstRate) / 100);

    const total = this.round2(
      subtotal +
      gstAmount +
      pstAmount +
      deliveryFees +
      deliveryTips -
      discount
    );

    return {
      ...details,
      items,
      subtotal,
      gstRate,
      gstAmount,
      pstRate,
      pstAmount,
      deliveryFees,
      deliveryTips,
      discount,
      total
    };
  }

  patch(p: Partial<NewOrderFormValue['details']>): void {
    const merged = { ...this.value, ...p };
    this.valueChange.emit(this.recalc(merged));
  }

  hasValidItems(): boolean {
    const items = this.value.items || [];

    return items.some(item => {
      const nameFilled = !!item.itemName?.trim();
      const price = this.toNumber(item.itemPrice);
      const qty = this.toNumber(item.itemQty);

      return nameFilled && price > 0 && qty > 0;
    });
  }

  getItemsValidationError(): string {
    if (!this.hasValidItems()) {
      return 'At least 1 item with name, price, and quantity is required.';
    }
    return '';
  }

  protected readonly taxLines = taxLines;

  money(v: number): string {
    return `C$ ${this.round2(this.toNumber(v)).toFixed(2)}`;
  }
}
