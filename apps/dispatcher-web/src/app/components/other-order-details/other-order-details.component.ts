import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { BaseInputComponent } from '../base-input/base-input.component';
import { PaymentMethodComponent } from '../payment-method/payment-method.component';
import { TextareaComponent } from '../textarea/textarea.component';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-other-order-details',
  standalone: true,
  imports: [CommonModule, BaseInputComponent, TextareaComponent, PaymentMethodComponent, ButtonComponent],
  templateUrl: './other-order-details.component.html'
})
export class OtherOrderDetailsComponent {
  @Input() value!: NewOrderFormValue['details'];
  @Output() valueChange = new EventEmitter<NewOrderFormValue['details']>();

  private toNumber(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  addItem(): void {
    const items = [...(this.value.items || [])];
    items.push({ itemName: '', itemPrice: 0, itemQty: 0 });
    this.patch({ items });
  }

  removeItem(index: number): void {
    const items = [...(this.value.items || [])];
    items.splice(index, 1);
    this.patch({ items });
  }

  updateItem(index: number, field: string, value: any): void {
    const items = [...(this.value.items || [])];
    items[index] = { ...items[index], [field]: value };
    this.patch({ items });
  }

  private recalc(details: NewOrderFormValue['details']): NewOrderFormValue['details'] {

    const items = details.items || [];

    const subtotal = this.round2(
      items.reduce((sum, item) => {
        const price = this.toNumber(item.itemPrice);
        const qty = this.toNumber(item.itemQty);
        return sum + price * qty;
      }, 0)
    );

    const taxRate = this.toNumber(details.taxRate);
    const deliveryFees = this.toNumber(details.deliveryFees);
    const deliveryTips = this.toNumber(details.deliveryTips);
    const discount = this.toNumber(details.discount);

    const taxAmount = this.round2((subtotal * taxRate) / 100);
    const total = this.round2(subtotal + taxAmount + deliveryFees + deliveryTips - discount);

    return {
      ...details,
      items,
      taxRate,
      deliveryFees,
      deliveryTips,
      discount,
      subtotal,
      taxAmount,
      total
    };
  }

  patch(p: Partial<NewOrderFormValue['details']>): void {
    const merged = { ...this.value, ...p };
    this.valueChange.emit(this.recalc(merged));
  }

  money(v: number): string {
    return `C$ ${this.round2(this.toNumber(v)).toFixed(2)}`;
  }
}