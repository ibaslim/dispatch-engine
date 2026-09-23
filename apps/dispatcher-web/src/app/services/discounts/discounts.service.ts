import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

const BASE = '/api/v1/discounts';

export type DiscountKind = 'percentage' | 'fixed_amount';
export type DiscountValueMode = 'fixed' | 'entered';
export type ScheduleKind = 'always' | 'weekly' | 'annual' | 'annual_nth_weekday' | 'date_list';

/** When a discount applies, and how often it comes back. */
export interface DiscountSchedule {
  kind: ScheduleKind;
  /** weekly: Monday is 0. */
  days?: number[];
  month?: number;
  day?: number;
  weekday?: number;
  nth?: number;
  offset_days?: number;
  duration_days?: number;
  dates?: string[];
  time_start?: string | null;
  time_end?: string | null;
}
export type DiscountTrigger = 'manual' | 'code' | 'automatic';
export type DiscountStatus = 'draft' | 'active' | 'paused' | 'ended' | 'archived';
export type DiscountReason =
  | 'late_delivery'
  | 'damaged_item'
  | 'wrong_address_our_fault'
  | 'sales_goodwill'
  | 'price_correction'
  | 'other';

export interface DiscountType {
  id: string;
  title: string;
  description: string | null;
  discount_count: number;
}

export interface DiscountTypeInput {
  title: string;
  description: string | null;
}

export interface Discount {
  id: string;
  title: string;
  public_label: string;
  description: string | null;
  discount_type_id: string | null;
  discount_type_title: string | null;
  kind: DiscountKind;
  /** entered: the dispatcher types the value on the order. */
  value_mode: DiscountValueMode;
  value: number | null;
  schedule: DiscountSchedule;
  schedule_label: string;
  trigger: DiscountTrigger;
  status: DiscountStatus;
  reason: DiscountReason | null;
  max_discount_amount: number | null;
  min_gross_fee: number | null;
  min_net_fee: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit_total: number | null;
  redemption_count: number;
}

export interface DiscountInput {
  title: string;
  public_label: string | null;
  description: string | null;
  discount_type_id: string | null;
  kind: DiscountKind;
  value_mode: DiscountValueMode;
  value: number | null;
  schedule: DiscountSchedule;
  trigger: DiscountTrigger;
  status: DiscountStatus;
  reason: DiscountReason | null;
  max_discount_amount: number | null;
  min_gross_fee: number | null;
  min_net_fee: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit_total: number | null;
}

/** What became of an automatic discount an order could get. */
export type AutomaticState = 'applied' | 'opted_out' | 'outranked' | 'waiting';

export interface AutomaticOffer {
  discount: Discount;
  amount: number;
  state: AutomaticState;
}

// ── Coupons ──────────────────────────────────────────────────────────────
// A code that unlocks one discount. It carries no price logic of its own.

export interface Coupon {
  id: string;
  discount_id: string;
  code: string;
  max_uses: number | null;
  used_count: number;
  tenant_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  batch_label: string | null;
  created_at: string | null;
}

export interface CouponCreate {
  code: string;
  tenant_id?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
}

export interface CouponBatchCreate {
  count: number;
  prefix?: string | null;
  batch_label: string;
  expires_at?: string | null;
}

export interface CouponUpdate {
  is_active?: boolean;
  expires_at?: string | null;
}

export interface CouponCheck {
  discount: Discount;
}

@Injectable({ providedIn: 'root' })
export class DiscountsService {
  private readonly http = inject(HttpClient);

  // ── Types ────────────────────────────────────────────────────────────────
  getTypes(): Observable<DiscountType[]> {
    return this.http.get<DiscountType[]>(`${BASE}/types`);
  }

  createType(payload: DiscountTypeInput): Observable<DiscountType> {
    return this.http.post<DiscountType>(`${BASE}/types`, payload);
  }

  updateType(id: string, payload: DiscountTypeInput): Observable<DiscountType> {
    return this.http.patch<DiscountType>(`${BASE}/types/${id}`, payload);
  }

  deleteType(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/types/${id}`);
  }

  // ── Discounts ────────────────────────────────────────────────────────────
  getDiscounts(
    filters: { trigger?: DiscountTrigger; status?: DiscountStatus; discountTypeId?: string } = {},
  ): Observable<Discount[]> {
    const params: Record<string, string> = {};
    if (filters.trigger) params['trigger'] = filters.trigger;
    if (filters.status) params['status'] = filters.status;
    if (filters.discountTypeId) params['discount_type_id'] = filters.discountTypeId;
    return this.http.get<Discount[]>(BASE, { params });
  }

  /** Live discounts a dispatcher may pick, filtered to the pickup day's schedule. */
  getPickable(at?: string, timeSpecified = true): Observable<Discount[]> {
    const params: Record<string, string> = { trigger: 'manual', status: 'active' };
    if (at) {
      params['at'] = at;
      params['time_specified'] = String(timeSpecified);
    }
    return this.http.get<Discount[]>(BASE, { params });
  }

  /** The automatic discounts an order would get. The server decides which one wins. */
  getAutomaticOffers(query: {
    at: string;
    timeSpecified: boolean;
    deliveryFee: number;
    optedOut: string[];
  }): Observable<AutomaticOffer[]> {
    let params = new HttpParams()
      .set('at', query.at)
      .set('time_specified', String(query.timeSpecified))
      .set('delivery_fee', String(query.deliveryFee));
    for (const id of query.optedOut) params = params.append('opted_out', id);
    return this.http.get<AutomaticOffer[]>(`${BASE}/automatic`, { params });
  }

  createDiscount(payload: DiscountInput): Observable<Discount> {
    return this.http.post<Discount>(BASE, payload);
  }

  updateDiscount(id: string, payload: Partial<DiscountInput>): Observable<Discount> {
    return this.http.patch<Discount>(`${BASE}/${id}`, payload);
  }

  deleteDiscount(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}`);
  }

  // ── Coupons ──────────────────────────────────────────────────────────────
  getCoupons(discountId: string, batchLabel?: string): Observable<Coupon[]> {
    const params: Record<string, string> = {};
    if (batchLabel) params['batch_label'] = batchLabel;
    return this.http.get<Coupon[]>(`${BASE}/${discountId}/coupons`, { params });
  }

  createCoupon(discountId: string, payload: CouponCreate): Observable<Coupon> {
    return this.http.post<Coupon>(`${BASE}/${discountId}/coupons`, payload);
  }

  createCouponBatch(discountId: string, payload: CouponBatchCreate): Observable<Coupon[]> {
    return this.http.post<Coupon[]>(`${BASE}/${discountId}/coupons/batch`, payload);
  }

  updateCoupon(discountId: string, couponId: string, payload: CouponUpdate): Observable<Coupon> {
    return this.http.patch<Coupon>(`${BASE}/${discountId}/coupons/${couponId}`, payload);
  }

  /** Triggers a browser download of every code for this discount, or one batch. */
  async exportCoupons(discountId: string, batchLabel?: string): Promise<void> {
    const params: Record<string, string> = {};
    if (batchLabel) params['batch_label'] = batchLabel;
    const blob = await firstValueFrom(
      this.http.get(`${BASE}/${discountId}/coupons/export.csv`, { params, responseType: 'blob' }),
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${batchLabel || 'coupons'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** What a code resolves to, so the order form can show it before saving. */
  checkCoupon(query: {
    code: string;
    at: string;
    timeSpecified?: boolean;
    vendorId?: string;
  }): Observable<CouponCheck> {
    let params = new HttpParams()
      .set('code', query.code)
      .set('at', query.at)
      .set('time_specified', String(query.timeSpecified ?? true));
    if (query.vendorId) params = params.set('vendor_id', query.vendorId);
    return this.http.post<CouponCheck>(`${BASE}/coupons/check`, null, { params });
  }
}
