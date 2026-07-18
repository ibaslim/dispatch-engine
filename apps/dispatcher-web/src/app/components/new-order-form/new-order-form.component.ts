import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import {
  DeliveryCategory,
  DeliveryConfigurationService,
  Surcharge,
} from '../../services/delivery-configuration/delivery-configuration.service';
import { OrdersService } from '../../services/orders/orders.service';
import { ProofOfDeliveryComponent } from '../proof-of-delivery/proof-of-delivery.component';
import { PickupFromComponent } from '../pickup-from/pickup-from.component';
import { DeliverToComponent } from '../deliver-to/deliver-to.component';
import { OtherOrderDetailsComponent } from '../other-order-details/other-order-details.component';

@Component({
  selector: 'app-new-order-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PickupFromComponent,
    DeliverToComponent,
    OtherOrderDetailsComponent,
    ProofOfDeliveryComponent
  ],
  templateUrl: './new-order-form.component.html'
})
export class NewOrderFormComponent implements OnInit {
  @Input() value: NewOrderFormValue = this.createDefaultValue();
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<NewOrderFormValue>();
  @Output() pinPickup = new EventEmitter<void>();
  @Output() pinDelivery = new EventEmitter<void>();

  categories: DeliveryCategory[] = [];
  surcharges: Surcharge[] = [];
  isQuoting = false;
  quoteError = '';
  private quoteRequest = 0;

  constructor(
    private readonly configurations: DeliveryConfigurationService,
    private readonly orders: OrdersService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [categories, policy, surcharges] = await Promise.all([
        firstValueFrom(this.configurations.getCategories()),
        firstValueFrom(this.configurations.getDeliveryPolicy()),
        firstValueFrom(this.configurations.getSurcharges()),
      ]);
      this.categories = categories;
      this.surcharges = surcharges;
      if (!this.value.orderNumber) {
        const details = this.withTaxRate(
          this.value.details,
          Number(policy.default_tax_percentage)
        );
        this.valueChange.emit({ ...this.value, details });
      }
    } catch {
      this.quoteError = 'Unable to load delivery categories.';
    }
  }

  private todayYYYYMMDD(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  createDefaultValue(): NewOrderFormValue {
    return {
      orderNumber: '',
      deliveryCategoryId: '',
      surchargeIds: [],
      routeQuote: null,
      pickup: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        email: '',
        address: '',
        location: null,
        pickupDate: this.todayYYYYMMDD(),
        pickupTime: ''
      },
      delivery: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        email: '',
        address: '',
        location: null,
        deliveryDate: this.todayYYYYMMDD(),
        deliveryTime: ''
      },
      details: {
        items: [
          {
            itemName: '',
            itemPrice: '',
            itemQty: ''
          }
        ],
        taxRate: 0,
        deliveryFees: 0,
        deliveryTips: 0,
        discount: 0,
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        instructions: '',
        payment: { method: 'cash_on_delivery' },
        proofOfDelivery: {
          signature: false,
          picture: false
        },
        incidentReport: null
      }
    };
  }

  patch(partial: Partial<NewOrderFormValue>): void {
    this.valueChange.emit({ ...this.value, ...partial });
  }

  onPickupChange(pickup: NewOrderFormValue['pickup']): void {
    const changed = pickup.location?.placeId !== this.value.pickup.location?.placeId;
    changed ? this.patchAndQuote({ pickup }) : this.patch({ pickup });
  }

  onDeliveryChange(delivery: NewOrderFormValue['delivery']): void {
    const changed = delivery.location?.placeId !== this.value.delivery.location?.placeId
      || delivery.deliveryDate !== this.value.delivery.deliveryDate
      || delivery.deliveryTime !== this.value.delivery.deliveryTime;
    changed ? this.patchAndQuote({ delivery }) : this.patch({ delivery });
  }

  onCategoryChange(deliveryCategoryId: string): void {
    this.patchAndQuote({ deliveryCategoryId });
  }

  toggleSurcharge(surchargeId: string): void {
    const surchargeIds = this.value.surchargeIds.includes(surchargeId)
      ? this.value.surchargeIds.filter((id) => id !== surchargeId)
      : [...this.value.surchargeIds, surchargeId];
    this.patchAndQuote({ surchargeIds });
  }

  private patchAndQuote(partial: Partial<NewOrderFormValue>): void {
    const next = { ...this.value, ...partial, routeQuote: null };
    if (!next.pickup.location || !next.delivery.location || !next.deliveryCategoryId) {
      this.quoteRequest += 1;
      this.quoteError = '';
      this.valueChange.emit({
        ...next,
        details: this.withDeliveryFee(next.details, 0),
      });
      return;
    }
    this.valueChange.emit(next);
    void this.requestQuote(next);
  }

  private async requestQuote(value: NewOrderFormValue): Promise<void> {
    const request = ++this.quoteRequest;
    this.isQuoting = true;
    this.quoteError = '';
    try {
      const quote = await firstValueFrom(this.orders.quoteDelivery({
        pickup_place_id: value.pickup.location!.placeId,
        delivery_place_id: value.delivery.location!.placeId,
        delivery_category_id: value.deliveryCategoryId,
        delivery_date: value.delivery.deliveryDate || null,
        delivery_time: value.delivery.deliveryTime || null,
        surcharge_ids: value.surchargeIds,
      }));
      if (request !== this.quoteRequest) return;
      const details = this.withDeliveryFee(this.value.details, quote.delivery_fee);
      this.valueChange.emit({ ...this.value, details, routeQuote: quote });
    } catch (error: unknown) {
      if (request !== this.quoteRequest) return;
      this.quoteError = this.quoteErrorText(error);
      this.valueChange.emit({
        ...this.value,
        details: this.withDeliveryFee(this.value.details, 0),
        routeQuote: null,
      });
    } finally {
      if (request === this.quoteRequest) this.isQuoting = false;
    }
  }

  private withDeliveryFee(
    details: NewOrderFormValue['details'], deliveryFees: number
  ): NewOrderFormValue['details'] {
    return this.withRecalculatedTotal(details, { deliveryFees });
  }

  private withTaxRate(
    details: NewOrderFormValue['details'], taxRate: number
  ): NewOrderFormValue['details'] {
    const taxAmount = Math.round(details.subtotal * taxRate) / 100;
    return this.withRecalculatedTotal(details, { taxRate, taxAmount });
  }

  private withRecalculatedTotal(
    details: NewOrderFormValue['details'],
    changes: Partial<NewOrderFormValue['details']>
  ): NewOrderFormValue['details'] {
    const updated = { ...details, ...changes };
    const total = updated.subtotal + updated.taxAmount + updated.deliveryFees
      + Number(updated.deliveryTips || 0) - Number(updated.discount || 0);
    return { ...updated, total: Math.round(total * 100) / 100 };
  }

  private quoteErrorText(error: unknown): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    return 'Unable to validate this delivery route.';
  }

  onProofOfDeliveryChange(
    proofOfDelivery: { signature: boolean; picture: boolean }
  ): void {
    this.patch({
      details: {
        ...this.value.details,
        proofOfDelivery,
      }
    });
  }

  private toMinutes(t: string): number {
    const [hh, mm] = t.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
    return hh * 60 + mm;
  }

  private get pickupTime(): string {
    return this.value.pickup?.pickupTime || '';
  }

  private get deliveryTime(): string {
    return this.value.delivery?.deliveryTime || '';
  }

  get showDeliveryTimeError(): boolean {
    if (!this.pickupTime || !this.deliveryTime) return false;

    const pickupDate = this.value.pickup?.pickupDate || '';
    const deliveryDate = this.value.delivery?.deliveryDate || '';

    if (pickupDate && deliveryDate && pickupDate !== deliveryDate) return false;

    return this.isDeliveryBeforeOrEqualPickup;
  }

  get deliveryTimeError(): string {
    return this.showDeliveryTimeError ? 'Delivery time must be after pickup time.' : '';
  }

  private get isDeliveryBeforeOrEqualPickup(): boolean {
    const p = this.toMinutes(this.pickupTime);
    const d = this.toMinutes(this.deliveryTime);
    if (Number.isNaN(p) || Number.isNaN(d)) return false;
    return d <= p;
  }
}
