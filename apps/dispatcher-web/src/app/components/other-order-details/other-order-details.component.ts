import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { Discount } from '@services/discounts/discounts.service';
import { BaseInputComponent } from '../base-input/base-input.component';
import { PaymentMethodComponent } from '../payment-method/payment-method.component';
import { TextareaComponent } from '../textarea/textarea.component';
import { ButtonComponent } from '../button/button.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';
import {
  DiscountPick,
  discountAmount,
  discountTerms,
  automaticAmount,
  couponAmount,
  discountTotal,
  priceDiscounts,
  taxLines,
  totalDiscount,
} from '@pages/orders/orders-formatting.util';

/** One automatic discount as the order form shows it. */
export interface AutomaticRow {
  id: string;
  title: string;
  when: string;
  amount: number;
  checked: boolean;
  disabled: boolean;
  note: string;
}

@Component({
  selector: 'app-other-order-details',
  standalone: true,
  imports: [
    CommonModule,
    BaseInputComponent,
    TextareaComponent,
    PaymentMethodComponent,
    ButtonComponent,
    ErrorMessageComponent
  ],
  templateUrl: './other-order-details.component.html'
})
export class OtherOrderDetailsComponent {
  @Input() value!: NewOrderFormValue['details'];
  @Input() routeQuote: NewOrderFormValue['routeQuote'] = null;
  @Input() showSubmitValidation = false;
  /** Active manual discounts an admin created, offered as a checklist. */
  @Input() availableDiscounts: Discount[] = [];
  /** The discount a checked coupon code unlocks, once validated. */
  @Input() couponDiscount: Discount | null = null;
  @Input() couponCheckError = '';
  @Input() couponChecking = false;

  @Output() valueChange = new EventEmitter<NewOrderFormValue['details']>();
  @Output() checkCoupon = new EventEmitter<void>();

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

  // ─── Discounts ────────────────────────────────────────────────────────────
  // The dispatcher picks from discounts an admin created; the server prices
  // them and caps the total at the delivery fee. The preview mirrors that.

  protected readonly discountTerms = discountTerms;

  discountPickerOpen = false;

  toggleDiscountPicker(): void {
    this.discountPickerOpen = !this.discountPickerOpen;
  }

  isSelected(discount: Discount): boolean {
    return this.selections().some((item) => item.discountId === discount.id);
  }

  private selections(): { discountId: string; value: string }[] {
    return this.value.discountSelections || [];
  }

  toggleDiscount(discount: Discount): void {
    const selections = [...this.selections()];
    const index = selections.findIndex((item) => item.discountId === discount.id);
    if (index >= 0) selections.splice(index, 1);
    else selections.push({ discountId: discount.id, value: '' });
    this.patch({ discountSelections: selections });
  }

  /** Whether the dispatcher types the amount for this one. */
  needsValue(discount: Discount): boolean {
    return discount.value_mode === 'entered';
  }

  enteredValue(discount: Discount): string {
    return this.selections().find((item) => item.discountId === discount.id)?.value || '';
  }

  setEnteredValue(discount: Discount, raw: unknown): void {
    const text = String(raw ?? '').trim();
    if (text && !/^\d+(\.\d*)?$/.test(text)) return;
    this.patch({
      discountSelections: this.selections().map((item) =>
        item.discountId === discount.id ? { ...item, value: text } : item,
      ),
    });
  }

  /** The input's unit, so a percentage and an amount don't look alike. */
  valueUnit(discount: Discount): string {
    return discount.kind === 'percentage' ? '%' : 'C$';
  }

  removeDiscount(id: string): void {
    this.patch({
      discountSelections: this.selections().filter((item) => item.discountId !== id),
    });
  }

  setDiscountNote(note: unknown): void {
    this.patch({ discountNote: String(note ?? '') });
  }

  /** True when at least one selected discount is manually triggered (note is relevant only then). */
  hasManualDiscountSelected(): boolean {
    return this.selectedPicks().some((pick) => pick.discount.trigger === 'manual');
  }

  /** The chosen discounts with their typed values, in the order picked. */
  selectedPicks(): DiscountPick[] {
    const byId = new Map(this.availableDiscounts.map((item) => [item.id, item]));
    return this.selections()
      .map((item) => ({ discount: byId.get(item.discountId), value: item.value }))
      .filter((item): item is DiscountPick => !!item.discount);
  }

  /** The fee left for hand-picked discounts once the automatic one has taken its share. */
  private feeAfterAutomatic(): number {
    const fee = this.toNumber(this.value.deliveryFees);
    return fee - automaticAmount(this.value.automaticOffers, this.value.optedOutDiscountIds, fee);
  }

  /** What a checked coupon code takes off, on what the automatic discount left. */
  couponAmountPreview(): number {
    const fee = this.toNumber(this.value.deliveryFees);
    return couponAmount(this.couponDiscount, fee, fee - this.feeAfterAutomatic());
  }

  /** The fee left for hand-picked discounts once automatic and a coupon have taken their share. */
  private feeAfterCoupon(): number {
    return this.feeAfterAutomatic() - this.couponAmountPreview();
  }

  /** Each selected discount with what it takes off, priced in turn. */
  discountLines(): { discount: Discount; amount: number }[] {
    return priceDiscounts(this.selectedPicks(), this.feeAfterCoupon());
  }

  /** What this one would take off if it were added next. */
  previewAmount(discount: Discount): number {
    if (this.isSelected(discount)) {
      const line = this.discountLines().find((item) => item.discount.id === discount.id);
      return line ? line.amount : 0;
    }
    const used = discountTotal(this.selectedPicks(), this.feeAfterCoupon());
    return discountAmount(discount, this.feeAfterCoupon() - used);
  }

  setCouponCode(code: unknown): void {
    this.patch({ couponCode: String(code ?? '').toUpperCase() });
  }

  onCheckCoupon(): void {
    this.checkCoupon.emit();
  }

  /** The problem with this discount's typed value, or null while it is fine. */
  valueError(discount: Discount): string | null {
    if (!this.isSelected(discount) || !this.needsValue(discount)) return null;
    const raw = this.enteredValue(discount);
    if (!raw.trim()) return 'Enter an amount.';
    const value = this.toNumber(raw);
    if (value <= 0) return 'Enter more than 0.';
    if (discount.kind === 'percentage' && value > 100) return 'A percentage cannot be over 100.';
    return null;
  }

  /** A selected discount still waiting for the value the dispatcher must type. */
  awaitingValue(): Discount[] {
    return this.selectedPicks()
      .filter((pick) => this.needsValue(pick.discount) && this.toNumber(pick.value) <= 0)
      .map((pick) => pick.discount);
  }

  /** True when the terms are fine but there is no fee to take anything off yet. */
  nothingToDiscountYet(): boolean {
    return this.selections().length > 0 && this.toNumber(this.value.deliveryFees) <= 0;
  }

  /** Lines the server already applied that no longer match a listed discount. */
  appliedOnlyLines(): NewOrderFormValue['details']['appliedDiscounts'] {
    const listed = new Set(this.availableDiscounts.map((item) => item.id));
    return (this.value.appliedDiscounts || []).filter(
      // Automatic ones have their own block.
      (line) => line.source !== 'automatic' && (!line.discount_id || !listed.has(line.discount_id)),
    );
  }

  // ─── Automatic discounts ─────────────────────────────────────────────────
  // They apply by themselves when the pickup fits their schedule. A dispatcher
  // can take one off this order, and the choice is saved with the order.

  automaticRows(): AutomaticRow[] {
    const optedOut = new Set(this.value.optedOutDiscountIds || []);
    const offers = this.value.automaticOffers || [];
    const rows: AutomaticRow[] = offers.map((offer) => {
      const removed = optedOut.has(offer.discount.id);
      const outranked = !removed && offer.state === 'outranked';
      return {
        id: offer.discount.id,
        title: offer.discount.title,
        when: offer.discount.schedule_label,
        amount: removed || outranked ? 0 : offer.amount,
        checked: !removed && !outranked,
        disabled: outranked,
        note: removed
          ? 'Removed from this order'
          : outranked
            ? 'A bigger offer applies instead'
            : offer.state === 'waiting'
              ? 'Applies once a delivery fee is quoted'
              : '',
      };
    });

    // What the order already carries, when it is no longer offered (ended since booking).
    const offered = new Set(offers.map((offer) => offer.discount.id));
    for (const line of this.value.appliedDiscounts || []) {
      if (line.source !== 'automatic' || !line.discount_id || offered.has(line.discount_id)) continue;
      const removed = optedOut.has(line.discount_id);
      rows.push({
        id: line.discount_id,
        title: line.label,
        when: '',
        amount: removed ? 0 : line.amount,
        checked: !removed,
        disabled: false,
        note: removed ? 'Removed from this order' : 'Applied when the order was booked',
      });
    }
    return rows;
  }

  toggleAutomatic(row: AutomaticRow): void {
    const optedOut = new Set(this.value.optedOutDiscountIds || []);
    if (row.checked) optedOut.add(row.id);
    else optedOut.delete(row.id);
    this.patch({ optedOutDiscountIds: [...optedOut] });
  }

  /** Lines that take something off, for the receipt. */
  automaticReceiptRows(): AutomaticRow[] {
    return this.automaticRows().filter((row) => row.checked && row.amount > 0);
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
    const picks = (details.discountSelections || [])
      .map((item) => ({
        discount: this.availableDiscounts.find((option) => option.id === item.discountId),
        value: item.value,
      }))
      .filter((item): item is DiscountPick => !!item.discount);
    const discount = totalDiscount(
      picks,
      deliveryFees,
      details.automaticOffers,
      details.optedOutDiscountIds,
      this.couponDiscount,
    );

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
