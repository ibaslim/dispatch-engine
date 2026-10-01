import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subject, Subscription, catchError, firstValueFrom, switchMap } from 'rxjs';

import { DeliveryRouteQuote, NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { localDate, localTime, scheduleErrors, type ScheduleBaseline, type ScheduleErrors } from '@pages/orders/order-schedule.util';
import {
  DeliveryCategory,
  DeliveryConfigurationService,
  OperationalZone,
  Surcharge,
} from '../../services/delivery-configuration/delivery-configuration.service';
import { canQuote, OrderQuoteService, type QuoteResult } from './order-quote.service';
import { DiscountPick, totalDiscount } from '@pages/orders/orders-formatting.util';
import { orderTotal, taxAmount } from '@pages/orders/order-totals.util';
import { apiErrorMessage } from '../../core/http/api-error.util';
import { AutomaticOffer, Discount, DiscountsService } from '@services/discounts/discounts.service';
import { ProofOfDeliveryComponent } from '../proof-of-delivery/proof-of-delivery.component';
import { PickupFromComponent } from '../pickup-from/pickup-from.component';
import { DeliverToComponent } from '../deliver-to/deliver-to.component';
import { OtherOrderDetailsComponent } from '../other-order-details/other-order-details.component';
import { GoogleMapsService } from '../../services/google-maps/google-maps.service';
import { ToastService } from '../../core/toast/toast.service';

type AutomaticQuery = Parameters<DiscountsService['getAutomaticOffers']>[0];

/** What an order carries while it has no quote: no route means no fee and no tax rate. */
const NO_QUOTE_CHARGES = { deliveryFees: 0, gstRate: 0, pstRate: 0, gstAmount: 0, pstAmount: 0 };

@Component({
  providers: [OrderQuoteService],
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
export class NewOrderFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() value: NewOrderFormValue = this.createDefaultValue();
  @Input() showSubmitValidation = false;
  // Bumped by the parent when the server refused a stale fee, to fetch a fresh quote.
  @Input() requoteTick = 0;
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
  // Each new value replaces the one before it, whether that is still waiting or already in flight.
  private readonly automaticTrigger$ = new Subject<AutomaticQuery>();
  private readonly subscriptions = new Subscription();

  /** The discount a checked coupon code unlocks, once validated against the server. */
  couponDiscount: Discount | null = null;
  couponCheckError = '';
  isCheckingCoupon = false;

  constructor(
    private readonly configurations: DeliveryConfigurationService,
    private readonly discounts: DiscountsService,
    private readonly googleMaps: GoogleMapsService,
    private readonly toast: ToastService,
    private readonly quotes: OrderQuoteService,
  ) {
    this.subscriptions.add(this.quotes.results$.subscribe((result) => this.applyQuote(result)));
    this.subscriptions.add(
      this.automaticTrigger$
        .pipe(
          switchMap((query) =>
            // Keep what is showing; saving still applies the real rule server-side.
            this.discounts.getAutomaticOffers(query).pipe(catchError(() => EMPTY)),
          ),
        )
        .subscribe((offers) => this.applyAutomaticOffers(offers)),
    );
  }

  get isQuoting(): boolean {
    return this.quotes.isQuoting;
  }

  get quoteError(): string {
    return this.quotes.error;
  }

  set quoteError(message: string) {
    this.quotes.error = message;
  }

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
      this.refreshAutomatic();
      // Tax rates belong to the pickup zone, so they arrive with the delivery quote.
      // A reopened order is quoted once, so what is shown is what a save will charge.
      const { routeQuote } = this.value;
      if (routeQuote && !routeQuote.quote_id && canQuote(this.value)) {
        this.quotes.request(this.value, true);
      }
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
  private refreshAutomatic(
    deliveryFees: number = this.value.details.deliveryFees,
    optedOut: string[] = this.value.details.optedOutDiscountIds || [],
  ): void {
    const at = this.pickupMoment();
    if (!at) return;
    this.automaticTrigger$.next({
      at,
      timeSpecified: this.value.pickup.pickupTimeSpecified,
      deliveryFee: deliveryFees || 0,
      optedOut,
    });
  }

  private applyAutomaticOffers(offers: AutomaticOffer[]): void {
    const details = this.withRecalculatedTotal(this.value.details, { automaticOffers: offers });
    this.valueChange.emit({ ...this.value, details });
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
    if (optedOutChanged) this.refreshAutomatic(details.deliveryFees, after);
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
      this.couponCheckError = apiErrorMessage(error, 'Unable to check that code.');
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
      this.refreshAutomatic();
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

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['requoteTick'] && !changes['requoteTick'].firstChange && canQuote(this.value)) {
      this.quotes.request(this.value, true);
    }
  }

  /** A change that can move the fee: quote again once the changes settle, or clear the quote. */
  private patchAndQuote(partial: Partial<NewOrderFormValue>): void {
    const next = { ...this.value, ...partial, routeQuote: null };
    if (!canQuote(next)) {
      this.quotes.cancel();
      this.valueChange.emit({ ...next, details: this.withRecalculatedTotal(next.details, NO_QUOTE_CHARGES) });
      return;
    }
    this.valueChange.emit(next);
    this.quotes.request(next, false);
  }

  private applyQuote(result: QuoteResult): void {
    if ('quote' in result) {
      const { quote } = result;
      const details = this.withQuotedCharges(this.value.details, quote);
      this.valueChange.emit({ ...this.value, details, routeQuote: quote });
      // The fee just changed, and automatic discounts come off the fee.
      this.refreshAutomatic(quote.delivery_fee);
      return;
    }
    if (result.error instanceof HttpErrorResponse && result.error.status === 429) {
      const firstNotification = this.googleMaps.enableManualFallback();
      if (firstNotification) {
        this.toast.warning(
          'Google Maps API limit is exhausted. Enter pickup and delivery addresses manually.'
        );
      }
    }
    // No route means no pickup zone, so neither the fee nor its tax rate applies.
    this.valueChange.emit({
      ...this.value,
      details: this.withRecalculatedTotal(this.value.details, NO_QUOTE_CHARGES),
      routeQuote: null,
    });
  }

  /** Applies the quoted delivery fee plus the pickup location's GST and PST.
   * The two taxes are kept apart so receipts can show them as separate lines. */
  private withQuotedCharges(
    details: NewOrderFormValue['details'], quote: DeliveryRouteQuote
  ): NewOrderFormValue['details'] {
    const gstRate = Number(quote.gst_rate || 0);
    const pstRate = Number(quote.pst_rate || 0);
    const gstAmount = taxAmount(details.subtotal, gstRate);
    const pstAmount = taxAmount(details.subtotal, pstRate);
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
    const total = orderTotal({
      subtotal: updated.subtotal,
      gstAmount: updated.gstAmount,
      pstAmount: updated.pstAmount,
      deliveryFees: updated.deliveryFees,
      deliveryTips: Number(updated.deliveryTips || 0),
      discount,
    });
    return { ...updated, discount, total };
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
