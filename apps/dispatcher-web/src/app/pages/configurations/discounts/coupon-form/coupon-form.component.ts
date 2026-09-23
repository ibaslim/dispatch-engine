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
import { DropdownSelectorComponent } from '@components/dropdown-selector/dropdown-selector.component';
import { ErrorMessageComponent } from '@components/error-message/error-message.component';
import { PopupComponent } from '@components/popup/popup.component';
import { SelectOption } from '@models/dropdown-selector/dropdown-selector.model';
import {
  Discount,
  DiscountInput,
  DiscountKind,
  DiscountSchedule,
  DiscountStatus,
  DiscountsService,
} from '@services/discounts/discounts.service';
import { DISCOUNT_KIND_LABELS } from '@pages/orders/orders-formatting.util';
import { ToastService } from '../../../../core/toast/toast.service';

/** The coupon's own discount terms. No type, no trigger picker, no "who sets
 * the amount" — all fixed, since a coupon is always trigger: 'code' with a
 * fixed value and no admin-facing category. */
interface CouponDiscountForm {
  id: string | null;
  title: string;
  public_label: string;
  description: string;
  kind: DiscountKind;
  value: string;
  schedule: DiscountSchedule;
  status: DiscountStatus;
  max_discount_amount: string;
  min_gross_fee: string;
  min_net_fee: string;
  starts_at: string;
  ends_at: string;
  usage_limit_total: string;
  redemption_count: number;
}

/** What a save resolved to, so the host can auto-open the codes popup only
 * right after a coupon is first created. */
export interface CouponSaved {
  id: string;
  isNew: boolean;
}

/**
 * A dedicated editor for one coupon's terms (amount, caps, availability).
 * Deliberately separate from the general discount editor rather than sharing
 * it behind conditionals — a coupon skips naming/type/trigger entirely, and
 * this form never needs to know how the general editor works. Codes
 * themselves live in the separate CouponCodesComponent, reached from the
 * coupon card's own "+ Code" button rather than from here.
 */
@Component({
  selector: 'app-coupon-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseInputComponent,
    ButtonComponent,
    DropdownSelectorComponent,
    ErrorMessageComponent,
    PopupComponent,
  ],
  templateUrl: './coupon-form.component.html',
})
export class CouponFormComponent implements OnChanges {
  private readonly service = inject(DiscountsService);
  private readonly toast = inject(ToastService);

  @Input() open = false;
  /** null = creating a new coupon. */
  @Input() discount: Discount | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<CouponSaved>();

  protected readonly addButtonClasses =
    '!rounded-lg !bg-[#24b879] !text-[#071a12] font-medium hover:!bg-[#3ddc97]';

  readonly kindOptions: SelectOption<DiscountKind>[] = [
    { value: 'percentage', label: DISCOUNT_KIND_LABELS['percentage'] },
    { value: 'fixed_amount', label: DISCOUNT_KIND_LABELS['fixed_amount'] },
  ];
  readonly statusOptions: SelectOption<DiscountStatus>[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'ended', label: 'Ended' },
    { value: 'archived', label: 'Archived' },
  ];

  form: CouponDiscountForm = this.blankForm();
  touched: Record<string, boolean> = {};
  saveAttempted = false;
  isSaving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open) return;
    this.form = this.discount ? this.formFromDiscount(this.discount) : this.blankForm();
    this.touched = {};
    this.saveAttempted = false;
  }

  close(): void {
    this.closed.emit();
  }

  get termsLocked(): boolean {
    return this.form.redemption_count > 0;
  }

  get valueLabel(): string {
    return this.form.kind === 'percentage' ? 'Percentage off (%)' : 'Amount off (C$)';
  }

  setKind(value: DiscountKind | ''): void {
    if (value) this.form.kind = value;
  }

  setStatus(value: DiscountStatus | ''): void {
    if (value) this.form.status = value;
  }

  /** A one-line readout of the terms so far, e.g. "20% off, up to $15". */
  summaryLine(): string {
    const value = Number(this.form.value);
    if (!this.form.value.trim() || !Number.isFinite(value) || value <= 0) {
      return 'Set an amount below to see what this coupon does.';
    }
    const amount = this.form.kind === 'percentage' ? `${value}% off` : `C$ ${value.toFixed(2)} off`;
    const cap = Number(this.form.max_discount_amount);
    const capped = this.form.kind === 'percentage' && this.form.max_discount_amount.trim() && cap > 0
      ? `, up to C$ ${cap.toFixed(2)}`
      : '';
    return `${amount}${capped}`;
  }

  markTouched(field: string): void {
    this.touched[field] = true;
  }

  private fieldErrors(): Record<string, string> {
    const form = this.form;
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors['title'] = 'Give the coupon a name.';
    if (!form.public_label.trim()) errors['public_label'] = 'Give the coupon a label.';

    const value = Number(form.value);
    const hasValue = !!form.value.trim() && Number.isFinite(value) && value > 0;
    if (!hasValue) {
      errors['value'] = 'Enter an amount.';
    } else if (form.kind === 'percentage' && value > 100) {
      errors['value'] = 'A percentage cannot be more than 100.';
    }

    if (form.starts_at && form.ends_at && form.starts_at >= form.ends_at) {
      errors['ends_at'] = 'The end date must come after the start.';
    }
    return errors;
  }

  fieldError(field: string): string | null {
    if (!this.touched[field] && !this.saveAttempted) return null;
    return this.fieldErrors()[field] ?? null;
  }

  hasError(field: string): boolean {
    return !!this.fieldError(field);
  }

  formError(): string | null {
    const errors = Object.values(this.fieldErrors());
    return errors.length ? errors[0] : null;
  }

  async save(): Promise<void> {
    this.saveAttempted = true;
    if (this.formError()) return;
    const wasNew = !this.form.id;
    this.isSaving = true;
    try {
      const payload = this.toPayload();
      let id = this.form.id;
      if (id) {
        const editable = this.termsLocked ? this.withoutTerms(payload) : payload;
        await firstValueFrom(this.service.updateDiscount(id, editable));
      } else {
        const created = await firstValueFrom(this.service.createDiscount(payload));
        id = created.id;
        this.form.id = id;
      }
      this.toast.success(`${payload.public_label} saved.`);
      this.saved.emit({ id, isNew: wasNew });
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to save this coupon.'));
    } finally {
      this.isSaving = false;
    }
  }

  private toPayload(): DiscountInput {
    return {
      title: this.form.title.trim(),
      public_label: this.form.public_label.trim() || null,
      description: this.form.description.trim() || null,
      discount_type_id: null,
      kind: this.form.kind,
      value_mode: 'fixed',
      value: this.form.value.trim() ? Number(this.form.value) : null,
      schedule: this.form.schedule,
      trigger: 'code',
      status: this.form.status,
      reason: null,
      max_discount_amount: this.optionalNumber(this.form.max_discount_amount),
      min_gross_fee: this.optionalNumber(this.form.min_gross_fee),
      min_net_fee: Number(this.form.min_net_fee) || 0,
      starts_at: this.form.starts_at ? new Date(this.form.starts_at).toISOString() : null,
      ends_at: this.form.ends_at ? new Date(this.form.ends_at).toISOString() : null,
      usage_limit_total: this.optionalNumber(this.form.usage_limit_total),
      usage_limit_per_tenant: null,
    };
  }

  private withoutTerms(payload: DiscountInput): Partial<DiscountInput> {
    const { kind, value, value_mode, max_discount_amount, min_gross_fee, min_net_fee, ...rest } = payload;
    return rest;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private blankForm(): CouponDiscountForm {
    return {
      id: null,
      title: '',
      public_label: '',
      description: '',
      kind: 'fixed_amount',
      value: '',
      schedule: { kind: 'always' },
      status: 'active',
      max_discount_amount: '',
      min_gross_fee: '',
      min_net_fee: '0',
      starts_at: '',
      ends_at: '',
      usage_limit_total: '',
      redemption_count: 0,
    };
  }

  private formFromDiscount(discount: Discount): CouponDiscountForm {
    return {
      id: discount.id,
      title: discount.title,
      public_label: discount.public_label,
      description: discount.description ?? '',
      kind: discount.kind,
      value: discount.value === null ? '' : String(discount.value),
      schedule: discount.schedule,
      status: discount.status,
      max_discount_amount: discount.max_discount_amount?.toString() ?? '',
      min_gross_fee: discount.min_gross_fee?.toString() ?? '',
      min_net_fee: String(discount.min_net_fee ?? 0),
      starts_at: this.toDateInput(discount.starts_at),
      ends_at: this.toDateInput(discount.ends_at),
      usage_limit_total: discount.usage_limit_total?.toString() ?? '',
      redemption_count: discount.redemption_count,
    };
  }

  private optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toDateInput(value: string | null): string {
    return value ? value.slice(0, 10) : '';
  }

  private errorText(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    return fallback;
  }
}
