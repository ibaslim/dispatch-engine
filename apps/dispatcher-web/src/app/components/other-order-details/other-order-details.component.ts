import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { BaseInputComponent } from '../base-input/base-input.component';
import { PaymentMethodComponent } from '../payment-method/payment-method.component';
import { TextareaComponent } from '../textarea/textarea.component';
import { ButtonComponent } from '../button/button.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';

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

    // For price and qty fields, validate and process as positive numbers only
    if (field === 'itemPrice' || field === 'itemQty') {
      // Remove non-numeric characters except decimal point
      const strValue = String(value ?? '').trim();

      // Allow only positive numbers (digits and single decimal point)
      if (strValue && !/^\d+(\.\d*)?$/.test(strValue)) {
        // Invalid input, don't update
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

    // required logic - both name AND price AND qty must be filled
    if (nameFilled && !priceFilled) errors.push('Price is required');
    if (nameFilled && !qtyFilled) errors.push('Quantity is required');

    // value must be > 0 if filled
    if (priceFilled && price <= 0) errors.push('Price must be greater than 0');
    if (qtyFilled && qty <= 0) errors.push('Quantity must be greater than 0');

    this.itemErrors[index] = errors;

    items[index] = item;
    this.patch({ items });
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

    // SUBTOTAL = price * qty ONLY
    const subtotal = this.round2(
      items.reduce((sum, item) => {
        const price = this.toNumber(item.itemPrice);
        const qty = this.toNumber(item.itemQty);

        // ignore empty rows
        if (!price || !qty) return sum;

        return sum + price * qty;
      }, 0)
    );

    const taxRate = this.toNumber(details.taxRate);
    const deliveryFees = this.toNumber(details.deliveryFees);
    const deliveryTips = this.toNumber(details.deliveryTips);
    const discount = this.toNumber(details.discount);

    const taxAmount = this.round2((subtotal * taxRate) / 100);

    // TOTAL = subtotal + extras
    const total = this.round2(
      subtotal +
      taxAmount +
      deliveryFees +
      deliveryTips -
      discount
    );

    return {
      ...details,
      items,
      subtotal,
      taxRate,
      taxAmount,
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

  // Validate that at least 1 item exists with name, price, and qty
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

  money(v: number): string {
    return `C$ ${this.round2(this.toNumber(v)).toFixed(2)}`;
  }
}