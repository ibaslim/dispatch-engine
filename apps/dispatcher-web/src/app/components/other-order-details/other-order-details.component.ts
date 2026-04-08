import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { CommonModule } from '@angular/common';
import { BaseInputComponent } from '../base-input/base-input.component';
import { TextareaComponent } from '../textarea/textarea.component';

@Component({
  selector: 'app-other-order-details',
  imports: [CommonModule, BaseInputComponent, TextareaComponent],
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

  private recalc(details: NewOrderFormValue['details']): NewOrderFormValue['details'] {
    const itemPrice = this.toNumber(details.itemPrice);
    const itemQty = this.toNumber(details.itemQty);

    const taxRate = this.toNumber(details.taxRate);
    const deliveryFees = this.toNumber(details.deliveryFees);
    const deliveryTips = this.toNumber(details.deliveryTips);
    const discount = this.toNumber(details.discount);

    const subtotal = this.round2(itemPrice * itemQty);
    const taxAmount = this.round2((subtotal * taxRate) / 100);
    const total = this.round2(subtotal + taxAmount + deliveryFees + deliveryTips - discount);

    return {
      ...details,
      itemPrice,
      itemQty,
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