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
import { DiscountPick, totalDiscount } from '@pages/orders/orders-formatting.util';
import { Discount, DiscountsService } from '@services/discounts/discounts.service';
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
  availableDiscounts: Discount[] = [];
  operationalZones: OperationalZone[] = [];
  categoryDropdownOpen = false;
  isQuoting = false;
  quoteError = '';
  private quoteRequest = 0;
  private automaticRequest = 0;

  /** The discount a checked coupon code unlocks, once validated against the server. */
  couponDiscount: Discount | null = null;
  couponCheckError = '';
  isCheckingCoupon = false;

  constructor(
    private readonly configurations: DeliveryConfigurationService,
    private readonly discounts: DiscountsService,
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
      const [categories, surcharges, operationalZones, discounts] = await Promise.all([
        firstValueFrom(this.configurations.getCategories()),
        firstValueFrom(this.configurations.getSurcharges()),
        firstValueFrom(this.configurations.getZones()),
        firstValueFrom(this.discounts.getPickable(this.pickupMoment(), this.value.pickup.pickupTimeSpecified)),
      ]);
      this.categories = categories;
      this.surcharges = surcharges;
      this.operationalZones = operationalZones;
      this.availableDiscounts = discounts;
      void this.refreshAutomatic();
      // Tax rates belong to the pickup zone, so they arrive with the delivery quote.
    } catch {
      this.quoteError = 'Unable to load delivery categories.';
    }
  }

  /** The planned pickup as the API wants it, so scheduled discounts filter. */
  private pickupMoment(): string | undefined {
    const { pickupDate, pickupTime, pickupTimeSpecified } = this.value.pickup;
    if (!pickupDate) return undefined;
    return `${pickupDate}T${pickupTimeSpecified && pickupTime ? pickupTime : '00:00'}:00`;
  }

  /**
   * Asks the server which automatic discount this order would get. The rule that
   * picks the winner stays on the server, so it is never decided here.
   */
  private async refreshAutomatic(
    deliveryFees: number = this.value.details.deliveryFees,
    optedOut: string[] = this.value.details.optedOutDiscountIds || [],
  ): Promise<void> {
    const at = this.pickupMoment();
    if (!at) return;
    const request = ++this.automaticRequest;
    try {
      const offers = await firstValueFrom(
        this.discounts.getAutomaticOffers({
          at,
          timeSpecified: this.value.pickup.pickupTimeSpecified,
          deliveryFee: deliveryFees || 0,
          optedOut,
        }),
      );
      if (request !== this.automaticRequest) return;
      const details = this.withRecalculatedTotal(this.value.details, { automaticOffers: offers });
      this.valueChange.emit({ ...this.value, details });
    } catch {
      // Keep what is showing; saving still applies the real rule server-side.
    }
  }

  /** Removing or restoring an automatic discount changes which one wins, so ask again. */
  onDetailsChange(details: NewOrderFormValue['details']): void {
    const before = this.value.details.optedOutDiscountIds || [];
    const after = details.optedOutDiscountIds || [];
    const optedOutChanged = before.length !== after.length || before.some((id) => !after.includes(id));
    // A typed-over code no longer matches what was checked, so the preview clears
    // until it is checked again.
    const couponCodeChanged = details.couponCode !== this.value.details.couponCode;
    if (couponCodeChanged) {
      this.couponDiscount = null;
      this.couponCheckError = '';
    }
    this.patch({ details: couponCodeChanged ? this.withRecalculatedTotal(details, {}) : details });
    if (optedOutChanged) void this.refreshAutomatic(details.deliveryFees, after);
  }

  /** Resolves a typed coupon code to the discount it unlocks, so the total can preview it. */
  async checkCoupon(): Promise<void> {
    const code = this.value.details.couponCode.trim();
    if (!code) return;
    const at = this.pickupMoment();
    if (!at) {
      this.couponCheckError = 'Set a pickup date first.';
      return;
    }
    this.isCheckingCoupon = true;
    this.couponCheckError = '';
    try {
      const result = await firstValueFrom(
        this.discounts.checkCoupon({ code, at, timeSpecified: this.value.pickup.pickupTimeSpecified }),
      );
      this.couponDiscount = result.discount;
      const details = this.withRecalculatedTotal(this.value.details, {});
      this.valueChange.emit({ ...this.value, details });
    } catch (error) {
      this.couponDiscount = null;
      this.couponCheckError = error instanceof HttpErrorResponse && typeof error.error?.detail === 'string'
        ? error.error.detail
        : 'Unable to check that code.';
    } finally {
      this.isCheckingCoupon = false;
    }
  }

  /** A discount can be tied to a weekday or a date, so the list follows the pickup. */
  private async refreshDiscounts(): Promise<void> {
    try {
      this.availableDiscounts = await firstValueFrom(
        this.discounts.getPickable(this.pickupMoment(), this.value.pickup.pickupTimeSpecified),
      );
    } catch {
      // Keep the list we already have; saving still validates server-side.
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
        discountSelections: [],
        discountNote: '',
        couponCode: '',
        automaticOffers: [],
        optedOutDiscountIds: [],
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
    const dayChanged = pickup.pickupDate !== this.value.pickup.pickupDate
      || pickup.pickupTime !== this.value.pickup.pickupTime
      || pickup.pickupTimeSpecified !== this.value.pickup.pickupTimeSpecified;
    const changed = pickup.location?.placeId !== this.value.pickup.location?.placeId;
    changed ? this.patchAndQuote({ pickup }) : this.patch({ pickup });
    // A scheduled discount only applies on its own days, so the list follows.
    if (dayChanged) {
      void this.refreshDiscounts();
      void this.refreshAutomatic();
    }
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
      // The fee just changed, and automatic discounts come off the fee.
      void this.refreshAutomatic(quote.delivery_fee);
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
    const picks = (updated.discountSelections || [])
      .map((item) => ({
        discount: this.availableDiscounts.find((option) => option.id === item.discountId),
        value: item.value,
      }))
      .filter((item): item is DiscountPick => !!item.discount);
    const discount = totalDiscount(
      picks,
      updated.deliveryFees,
      updated.automaticOffers,
      updated.optedOutDiscountIds,
      this.couponDiscount,
    );
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
