import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { toPlannedAt } from '@dispatch/shared/contracts';

import { DeliveryRouteQuote, NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { localDate, localTime, scheduleErrors, type ScheduleBaseline, type ScheduleErrors } from '@pages/orders/order-schedule.util';
import {
  DeliveryCategory,
  DeliveryConfigurationService,
  OperationalZone,
  Surcharge,
} from '../../services/delivery-configuration/delivery-configuration.service';
import { OrdersService } from '../../services/orders/orders.service';
import { manualDiscountAmount } from '@pages/orders/orders-formatting.util';
import { ProofOfDeliveryComponent } from '../proof-of-delivery/proof-of-delivery.component';
import { PickupFromComponent } from '../pickup-from/pickup-from.component';
import { DeliverToComponent } from '../deliver-to/deliver-to.component';
import { OtherOrderDetailsComponent } from '../other-order-details/other-order-details.component';
import { GoogleMapsService } from '../../services/google-maps/google-maps.service';
import { ToastService } from '../../core/toast/toast.service';

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
  // The schedule when editing began; stops left unchanged skip the past-date check.
  @Input() scheduleBaseline: ScheduleBaseline | null = null;

  @Output() valueChange = new EventEmitter<NewOrderFormValue>();
  @Output() pinPickup = new EventEmitter<void>();
  @Output() pinDelivery = new EventEmitter<void>();

  categories: DeliveryCategory[] = [];
  surcharges: Surcharge[] = [];
  operationalZones: OperationalZone[] = [];
  categoryDropdownOpen = false;
  isQuoting = false;
  quoteError = '';
  private quoteRequest = 0;

  constructor(
    private readonly configurations: DeliveryConfigurationService,
    private readonly orders: OrdersService,
    private readonly googleMaps: GoogleMapsService,
    private readonly toast: ToastService,
  ) {}

  get selectedCategory(): DeliveryCategory | undefined {
    return this.categories.find((category) => category.id === this.value.deliveryCategoryId);
  }

  @HostListener('document:click', ['$event'])
  closeCategoryDropdownOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.delivery-category-dropdown')) {
      this.categoryDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeCategoryDropdownOnEscape(): void {
    this.categoryDropdownOpen = false;
  }

  async ngOnInit(): Promise<void> {
    try {
      const [categories, surcharges, operationalZones] = await Promise.all([
        firstValueFrom(this.configurations.getCategories()),
        firstValueFrom(this.configurations.getSurcharges()),
        firstValueFrom(this.configurations.getZones()),
      ]);
      this.categories = categories;
      this.surcharges = surcharges;
      this.operationalZones = operationalZones;
      // Tax rates belong to the pickup zone, so they arrive with the delivery quote.
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
        pickupTime: '',
        pickupTimeSpecified: false
      },
      delivery: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        email: '',
        address: '',
        location: null,
        deliveryDate: this.todayYYYYMMDD(),
        deliveryTime: '',
        deliveryTimeSpecified: false
      },
      details: {
        items: [
          {
            itemName: '',
            itemPrice: '',
            itemQty: ''
          }
        ],
        gstRate: 0,
        pstRate: 0,
        deliveryFees: 0,
        deliveryTips: 0,
        discount: 0,
        manualDiscount: null,
        appliedDiscounts: [],
        subtotal: 0,
        gstAmount: 0,
        pstAmount: 0,
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
      || delivery.deliveryTime !== this.value.delivery.deliveryTime
      || delivery.deliveryTimeSpecified !== this.value.delivery.deliveryTimeSpecified;
    changed ? this.patchAndQuote({ delivery }) : this.patch({ delivery });
  }

  onCategoryChange(deliveryCategoryId: string): void {
    this.categoryDropdownOpen = false;
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
        details: this.withRecalculatedTotal(next.details, {
          deliveryFees: 0,
          gstRate: 0,
          pstRate: 0,
          gstAmount: 0,
          pstAmount: 0,
        }),
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
        delivery_planned_at: value.delivery.deliveryDate
          ? toPlannedAt(
              value.delivery.deliveryDate,
              value.delivery.deliveryTimeSpecified ? value.delivery.deliveryTime : null,
            ).plannedAt
          : null,
        delivery_time_specified: Boolean(
          value.delivery.deliveryDate && value.delivery.deliveryTimeSpecified && value.delivery.deliveryTime,
        ),
        surcharge_ids: value.surchargeIds,
        pickup_address: value.pickup.address,
        delivery_address: value.delivery.address,
      }));
      if (request !== this.quoteRequest) return;
      const details = this.withQuotedCharges(this.value.details, quote);
      this.valueChange.emit({ ...this.value, details, routeQuote: quote });
    } catch (error: unknown) {
      if (request !== this.quoteRequest) return;
      if (error instanceof HttpErrorResponse && error.status === 429) {
        const firstNotification = this.googleMaps.enableManualFallback();
        if (firstNotification) {
          this.toast.warning(
            'Google Maps API limit is exhausted. Enter pickup and delivery addresses manually.'
          );
        }
      }
      this.quoteError = this.quoteErrorText(error);
      // No route means no pickup zone, so neither the fee nor its tax rate applies.
      this.valueChange.emit({
        ...this.value,
        details: this.withRecalculatedTotal(this.value.details, {
          deliveryFees: 0,
          gstRate: 0,
          pstRate: 0,
          gstAmount: 0,
          pstAmount: 0,
        }),
        routeQuote: null,
      });
    } finally {
      if (request === this.quoteRequest) this.isQuoting = false;
    }
  }

  /** Applies the quoted delivery fee plus the pickup location's GST and PST.
   * The two taxes are kept apart so receipts can show them as separate lines. */
  private withQuotedCharges(
    details: NewOrderFormValue['details'], quote: DeliveryRouteQuote
  ): NewOrderFormValue['details'] {
    const gstRate = Number(quote.gst_rate || 0);
    const pstRate = Number(quote.pst_rate || 0);
    const gstAmount = Math.round(details.subtotal * gstRate) / 100;
    const pstAmount = Math.round(details.subtotal * pstRate) / 100;
    return this.withRecalculatedTotal(details, {
      deliveryFees: quote.delivery_fee,
      gstRate,
      pstRate,
      gstAmount,
      pstAmount,
    });
  }

  private withRecalculatedTotal(
    details: NewOrderFormValue['details'],
    changes: Partial<NewOrderFormValue['details']>
  ): NewOrderFormValue['details'] {
    const updated = { ...details, ...changes };
    // A percentage discount follows the fee, so it is re-priced with the quote.
    const discount = manualDiscountAmount(updated.manualDiscount, updated.deliveryFees);
    const total = updated.subtotal + updated.gstAmount + updated.pstAmount + updated.deliveryFees
      + Number(updated.deliveryTips || 0) - discount;
    return { ...updated, discount, total: Math.round(total * 100) / 100 };
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

  get schedule(): ScheduleErrors {
    return scheduleErrors(this.value, this.scheduleBaseline);
  }

  get today(): string {
    return localDate();
  }

  get deliveryMinDate(): string {
    const pickupDate = this.value.pickup.pickupDate;
    return pickupDate && pickupDate > this.today ? pickupDate : this.today;
  }

  get pickupMinTime(): string | null {
    return this.value.pickup.pickupDate === this.today ? localTime() : null;
  }

  get deliveryMinTime(): string | null {
    const { pickup, delivery } = this.value;
    const floors: string[] = [];
    if (delivery.deliveryDate === this.today) floors.push(localTime());
    if (delivery.deliveryDate === pickup.pickupDate && pickup.pickupTimeSpecified && pickup.pickupTime) {
      floors.push(pickup.pickupTime);
    }
    return floors.length ? floors.sort()[floors.length - 1] : null;
  }

}
