import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { BaseInputComponent } from '@components/base-input/base-input.component';
import { ButtonComponent } from '@components/button/button.component';
import { PopupComponent } from '@components/popup/popup.component';
import { Coupon, DiscountsService } from '@services/discounts/discounts.service';
import { ToastService } from '../../../../core/toast/toast.service';

/** A single code to add by hand. */
interface CouponCodeForm {
  code: string;
  tenant_id: string;
  max_uses: string;
  expires_at: string;
}

/** A batch of single-use codes to generate. */
interface CouponBatchForm {
  count: string;
  prefix: string;
  batch_label: string;
  expires_at: string;
}

/**
 * The codes that redeem one coupon: add one by hand, generate a labeled
 * batch, list/filter/export what exists, toggle a code active. Deliberately
 * its own popup rather than a section of the coupon's terms editor — adding
 * a code is a far more common action than editing the amount or caps, so it
 * gets its own quick "+ Code" entry point from the coupon card.
 */
@Component({
  selector: 'app-coupon-codes',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseInputComponent, ButtonComponent, PopupComponent],
  templateUrl: './coupon-codes.component.html',
})
export class CouponCodesComponent implements OnChanges {
  private readonly service = inject(DiscountsService);
  private readonly toast = inject(ToastService);

  @Input() open = false;
  @Input() discountId: string | null = null;
  @Input() discountLabel = '';

  @Output() closed = new EventEmitter<void>();

  coupons: Coupon[] = [];
  couponsLoading = false;
  couponBatchFilter = '';
  couponSingleForm: CouponCodeForm = { code: '', tenant_id: '', max_uses: '', expires_at: '' };
  couponBatchForm: CouponBatchForm = { count: '50', prefix: '', batch_label: '', expires_at: '' };
  isCreatingCoupon = false;
  isCreatingBatch = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open) return;
    this.coupons = [];
    this.couponBatchFilter = '';
    this.couponSingleForm = { code: '', tenant_id: '', max_uses: '', expires_at: '' };
    this.couponBatchForm = { count: '50', prefix: '', batch_label: '', expires_at: '' };
    if (this.discountId) void this.loadCoupons(this.discountId);
  }

  close(): void {
    this.closed.emit();
  }

  async loadCoupons(discountId: string): Promise<void> {
    this.couponsLoading = true;
    try {
      this.coupons = await firstValueFrom(this.service.getCoupons(discountId));
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to load codes.'));
    } finally {
      this.couponsLoading = false;
    }
  }

  async createSingleCoupon(): Promise<void> {
    const id = this.discountId;
    const code = this.couponSingleForm.code.trim();
    if (!id || !code) return;
    this.isCreatingCoupon = true;
    try {
      await firstValueFrom(
        this.service.createCoupon(id, {
          code,
          tenant_id: this.couponSingleForm.tenant_id.trim() || null,
          max_uses: this.optionalNumber(this.couponSingleForm.max_uses),
          expires_at: this.couponSingleForm.expires_at
            ? new Date(this.couponSingleForm.expires_at).toISOString()
            : null,
        }),
      );
      this.couponSingleForm = { code: '', tenant_id: '', max_uses: '', expires_at: '' };
      await this.loadCoupons(id);
      this.toast.success('Code added.');
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to add that code.'));
    } finally {
      this.isCreatingCoupon = false;
    }
  }

  async createCouponBatch(): Promise<void> {
    const id = this.discountId;
    const batch = this.couponBatchForm;
    if (!id || !batch.batch_label.trim() || !Number(batch.count)) return;
    this.isCreatingBatch = true;
    try {
      const created = await firstValueFrom(
        this.service.createCouponBatch(id, {
          count: Number(batch.count),
          prefix: batch.prefix.trim() || null,
          batch_label: batch.batch_label.trim(),
          expires_at: batch.expires_at ? new Date(batch.expires_at).toISOString() : null,
        }),
      );
      this.couponBatchForm = { count: '50', prefix: '', batch_label: '', expires_at: '' };
      await this.loadCoupons(id);
      this.toast.success(`${created.length} codes generated.`);
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to generate that batch.'));
    } finally {
      this.isCreatingBatch = false;
    }
  }

  async toggleCouponActive(coupon: Coupon): Promise<void> {
    const id = this.discountId;
    if (!id) return;
    try {
      await firstValueFrom(this.service.updateCoupon(id, coupon.id, { is_active: !coupon.is_active }));
      await this.loadCoupons(id);
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to update that code.'));
    }
  }

  async exportCoupons(): Promise<void> {
    const id = this.discountId;
    if (!id) return;
    try {
      await this.service.exportCoupons(id, this.couponBatchFilter.trim() || undefined);
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to export codes.'));
    }
  }

  get filteredCoupons(): Coupon[] {
    const label = this.couponBatchFilter.trim().toLowerCase();
    if (!label) return this.coupons;
    return this.coupons.filter((coupon) => (coupon.batch_label ?? '').toLowerCase().includes(label));
  }

  couponUsageLabel(coupon: Coupon): string {
    return coupon.max_uses === null
      ? `${coupon.used_count} used`
      : `${coupon.used_count} of ${coupon.max_uses} used`;
  }

  private optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private errorText(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    return fallback;
  }
}
