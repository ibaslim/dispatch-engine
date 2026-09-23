import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { BaseInputComponent } from '@components/base-input/base-input.component';
import { ButtonComponent } from '@components/button/button.component';
import { DropdownSelectorComponent } from '@components/dropdown-selector/dropdown-selector.component';
import { ErrorMessageComponent } from '@components/error-message/error-message.component';
import { PopupComponent } from '@components/popup/popup.component';
import { TextareaComponent } from '@components/textarea/textarea.component';
import { SelectOption } from '@models/dropdown-selector/dropdown-selector.model';
import { ToastService } from '../../../core/toast/toast.service';
import { ScheduleEditorComponent } from './schedule-editor/schedule-editor.component';
import { CouponFormComponent, CouponSaved } from './coupon-form/coupon-form.component';
import { CouponCodesComponent } from './coupon-codes/coupon-codes.component';

import {
  Discount,
  DiscountInput,
  DiscountKind,
  DiscountReason,
  DiscountSchedule,
  DiscountStatus,
  DiscountTrigger,
  DiscountType,
  DiscountValueMode,
  DiscountsService,
} from '@services/discounts/discounts.service';
import {
  DISCOUNT_KIND_LABELS,
  DISCOUNT_REASON_LABELS,
  discountTerms,
  money,
} from '@pages/orders/orders-formatting.util';

type Tab = 'discounts' | 'coupons' | 'types';

/** The editor's own shape: numbers stay strings while they are being typed.
 * A coupon (trigger: 'code') is edited by the separate CouponFormComponent
 * instead, so this form only ever handles manual/automatic discounts. */
interface DiscountForm {
  id: string | null;
  title: string;
  public_label: string;
  description: string;
  discount_type_id: string;
  kind: DiscountKind;
  value_mode: DiscountValueMode;
  value: string;
  trigger: DiscountTrigger;
  schedule: DiscountSchedule;
  status: DiscountStatus;
  reason: DiscountReason | '';
  max_discount_amount: string;
  min_gross_fee: string;
  min_net_fee: string;
  starts_at: string;
  ends_at: string;
  usage_limit_total: string;
  /** Terms are fixed once it has been given, so the form locks them. */
  redemption_count: number;
}

@Component({
  selector: 'app-discounts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseInputComponent,
    ButtonComponent,
    DropdownSelectorComponent,
    ErrorMessageComponent,
    PopupComponent,
    TextareaComponent,
    ScheduleEditorComponent,
    CouponFormComponent,
    CouponCodesComponent,
  ],
  templateUrl: './discounts.component.html',
})
export class DiscountsComponent implements OnInit {
  private readonly service = inject(DiscountsService);
  private readonly toast = inject(ToastService);

  @ViewChild(ScheduleEditorComponent) scheduleEditor?: ScheduleEditorComponent;

  protected readonly money = money;
  protected readonly discountTerms = discountTerms;
  protected readonly kindLabels = DISCOUNT_KIND_LABELS;
  protected readonly reasonLabels = DISCOUNT_REASON_LABELS;

  /** The shared buttons default to yellow/grey; these match the other configuration tabs. */
  protected readonly addButtonClasses =
    '!rounded-lg !bg-[#24b879] !text-[#071a12] font-medium hover:!bg-[#3ddc97]';

  readonly kindOptions: SelectOption<DiscountKind>[] = [
    { value: 'percentage', label: DISCOUNT_KIND_LABELS['percentage'] },
    { value: 'fixed_amount', label: DISCOUNT_KIND_LABELS['fixed_amount'] },
  ];
  readonly valueModeOptions: SelectOption<DiscountValueMode>[] = [
    { value: 'fixed', label: 'Set here' },
    { value: 'entered', label: 'Dispatcher types it per order' },
  ];
  /** An automatic discount has nobody to type an amount, so it can only be fixed. */
  readonly fixedOnlyOptions: SelectOption<DiscountValueMode>[] = [
    { value: 'fixed', label: 'Set here' },
  ];
  // 'code' is deliberately left out: a coupon is created from the Coupons tab,
  // which fixes the trigger itself instead of offering it here.
  readonly triggerOptions: SelectOption<DiscountTrigger>[] = [
    { value: 'manual', label: 'Manual — dispatcher picks it' },
    { value: 'automatic', label: 'Automatic — applies on its own' },
  ];

  readonly statusOptions: SelectOption<DiscountStatus>[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'ended', label: 'Ended' },
    { value: 'archived', label: 'Archived' },
  ];
  /** The status filter above the list; unlike the editor's, it can be "All".
   * A distinct sentinel value is needed because the dropdown's own blank/placeholder
   * option is also "", which would make an empty-string "All" indistinguishable
   * from nothing being selected. */
  readonly statusFilterOptions: SelectOption<DiscountStatus | 'all'>[] = [
    { value: 'all', label: 'All statuses' },
    ...this.statusOptions,
  ];

  /** Rebuilt only when the types load, so its identity is stable between checks. */
  typeOptions: SelectOption<string>[] = [];
  /** Same list, plus "All types" for the filter above the list. */
  typeFilterOptions: SelectOption<string>[] = [{ value: 'all', label: 'All types' }];

  // The dropdowns emit '' for the blank entry, so each setter narrows the type.
  setKind(value: DiscountKind | ''): void {
    if (this.discountForm && value) this.discountForm.kind = value;
  }

  setValueMode(value: DiscountValueMode | ''): void {
    if (this.discountForm && value) this.discountForm.value_mode = value;
  }

  setTrigger(value: DiscountTrigger | ''): void {
    const form = this.discountForm;
    if (!form || !value) return;
    form.trigger = value;
    this.markTouched('trigger');
    // Nobody is there to type an amount on an automatic discount.
    if (value === 'automatic') form.value_mode = 'fixed';
  }

  get isAutomatic(): boolean {
    return this.discountForm?.trigger === 'automatic';
  }

  valueModeChoices(): SelectOption<DiscountValueMode>[] {
    return this.isAutomatic ? this.fixedOnlyOptions : this.valueModeOptions;
  }

  /** An automatic discount with no schedule would take something off every order. */
  get appliesToEveryOrder(): boolean {
    return this.isAutomatic && !!this.scheduleEditor?.appliesEveryDay;
  }

  setStatus(value: DiscountStatus | ''): void {
    if (this.discountForm && value) this.discountForm.status = value;
  }

  tab: Tab = 'discounts';

  /** Switching between Discounts and Coupons changes what "type" filters to
   * (a coupon's discount has none), so the list is re-fetched on that boundary. */
  setTab(tab: Tab): void {
    const changed = this.tab !== tab;
    this.tab = tab;
    if (changed && (tab === 'discounts' || tab === 'coupons')) void this.reloadDiscounts();
  }
  isLoading = true;
  errorMessage = '';
  searchQuery = '';
  /** Filters the list is fetched with; "All types" and "Active" are the defaults. */
  typeFilter = 'all';
  statusFilter: DiscountStatus | 'all' = 'active';

  discounts: Discount[] = [];
  types: DiscountType[] = [];

  discountForm: DiscountForm | null = null;
  typeForm: { id: string | null; title: string; description: string } | null = null;
  /** What a confirmation is pending for; the app confirms in a popup, never in the browser. */
  deleteTarget: { kind: 'discount' | 'type'; id: string; name: string } | null = null;
  isSaving = false;
  isDeleting = false;
  /** A field's error appears once it has been visited, or once Save is pressed. */
  touched: Record<string, boolean> = {};
  saveAttempted = false;

  // ── Coupon editor: a separate popup (CouponFormComponent), not this form ──
  couponEditorOpen = false;
  couponEditorTarget: Discount | null = null;

  openCouponForm(discount?: Discount): void {
    this.couponEditorTarget = discount ?? null;
    this.couponEditorOpen = true;
  }

  closeCouponForm(): void {
    this.couponEditorOpen = false;
    this.couponEditorTarget = null;
  }

  async onCouponSaved(result: CouponSaved): Promise<void> {
    this.closeCouponForm();
    await this.load();
    // A brand-new coupon has no codes yet, so the natural next step is to add
    // some; an edit to an existing one's terms doesn't need that interruption.
    if (result.isNew) {
      const discount = this.discounts.find((item) => item.id === result.id);
      this.openCouponCodes(result.id, discount?.public_label ?? discount?.title ?? '');
    }
  }

  // ── Coupon codes: a separate popup (CouponCodesComponent), reached from a
  // coupon card's own "+ Code" button, or automatically right after a new
  // coupon is created. ────────────────────────────────────────────────────
  couponCodesOpen = false;
  couponCodesDiscountId: string | null = null;
  couponCodesDiscountLabel = '';

  openCouponCodes(discountId: string, label: string): void {
    this.couponCodesDiscountId = discountId;
    this.couponCodesDiscountLabel = label;
    this.couponCodesOpen = true;
  }

  closeCouponCodes(): void {
    this.couponCodesOpen = false;
    this.couponCodesDiscountId = null;
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [discounts, types] = await Promise.all([
        firstValueFrom(this.service.getDiscounts(this.currentFilters())),
        firstValueFrom(this.service.getTypes()),
      ]);
      this.discounts = discounts;
      this.types = types;
      this.typeOptions = types.map((type) => ({ value: type.id, label: type.title }));
      this.typeFilterOptions = [{ value: 'all', label: 'All types' }, ...this.typeOptions];
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to load discounts.');
    } finally {
      this.isLoading = false;
    }
  }

  private currentFilters(): { status?: DiscountStatus; discountTypeId?: string } {
    const filters: { status?: DiscountStatus; discountTypeId?: string } = {};
    if (this.statusFilter !== 'all') filters.status = this.statusFilter;
    // A coupon's discount always has a null type, so the type filter (hidden on
    // that tab already) would otherwise wrongly carry over and filter it to nothing.
    if (this.tab !== 'coupons' && this.typeFilter !== 'all') filters.discountTypeId = this.typeFilter;
    return filters;
  }

  /** Re-fetches just the discounts, so switching a filter doesn't reload types/usage too. */
  private async reloadDiscounts(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.discounts = await firstValueFrom(this.service.getDiscounts(this.currentFilters()));
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to load discounts.');
    } finally {
      this.isLoading = false;
    }
  }

  setTypeFilter(value: string): void {
    if (!value) return;
    this.typeFilter = value;
    void this.reloadDiscounts();
  }

  setStatusFilter(value: DiscountStatus | 'all' | ''): void {
    if (!value) return;
    this.statusFilter = value;
    void this.reloadDiscounts();
  }

  // ── Listing ──────────────────────────────────────────────────────────────
  /** The same fetched list, split by trigger so a coupon never shows as a plain discount card. */
  get filteredDiscounts(): Discount[] {
    const scoped = this.tab === 'coupons'
      ? this.discounts.filter((item) => item.trigger === 'code')
      : this.discounts.filter((item) => item.trigger !== 'code');
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return scoped;
    return scoped.filter((item) =>
      `${item.title} ${item.discount_type_title ?? ''}`.toLowerCase().includes(query),
    );
  }

  get filteredTypes(): DiscountType[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.types;
    return this.types.filter((item) => item.title.toLowerCase().includes(query));
  }

  statusClass(status: DiscountStatus): string {
    if (status === 'active') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    if (status === 'draft') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    return 'bg-gray-100 text-gray-600 dark:bg-[#303330] dark:text-gray-300';
  }

  limitLabel(discount: Discount): string {
    if (discount.usage_limit_total === null) return `${discount.redemption_count} used`;
    return `${discount.redemption_count} of ${discount.usage_limit_total} used`;
  }

  // ── Discount editor (manual/automatic only; a coupon uses CouponFormComponent) ──
  openDiscount(discount?: Discount): void {
    this.errorMessage = '';
    this.discountForm = discount
      ? {
          id: discount.id,
          title: discount.title,
          public_label: discount.public_label,
          description: discount.description ?? '',
          discount_type_id: discount.discount_type_id ?? '',
          kind: discount.kind,
          value_mode: discount.value_mode,
          value: discount.value === null ? '' : String(discount.value),
          trigger: discount.trigger,
          schedule: discount.schedule,
          status: discount.status,
          reason: discount.reason ?? '',
          max_discount_amount: discount.max_discount_amount?.toString() ?? '',
          min_gross_fee: discount.min_gross_fee?.toString() ?? '',
          min_net_fee: String(discount.min_net_fee ?? 0),
          starts_at: this.toDateInput(discount.starts_at),
          ends_at: this.toDateInput(discount.ends_at),
          usage_limit_total: discount.usage_limit_total?.toString() ?? '',
          redemption_count: discount.redemption_count,
        }
      : {
          id: null,
          title: '',
          public_label: '',
          description: '',
          discount_type_id: this.types[0]?.id ?? '',
          kind: 'percentage',
          value_mode: 'fixed',
          value: '',
          trigger: 'manual',
          schedule: { kind: 'always' },
          status: 'active',
          reason: '',
          max_discount_amount: '',
          min_gross_fee: '',
          min_net_fee: '0',
          starts_at: '',
          ends_at: '',
          usage_limit_total: '',
          redemption_count: 0,
        };
  }

  closeDiscount(): void {
    this.discountForm = null;
    this.touched = {};
    this.saveAttempted = false;
  }

  // ── Field-level validation ────────────────────────────────────────────────

  markTouched(field: string): void {
    this.touched[field] = true;
  }

  /** Every problem with the form, keyed by the field it belongs under. */
  private fieldErrors(): Record<string, string> {
    const form = this.discountForm;
    const errors: Record<string, string> = {};
    if (!form) return errors;

    if (!form.title.trim()) errors['title'] = 'Give the discount a name.';
    if (!form.discount_type_id) {
      errors['type'] = this.types.length
        ? 'Choose a type.'
        : 'Add a type on the Types tab first.';
    }

    const value = Number(form.value);
    const hasValue = !!form.value.trim() && Number.isFinite(value) && value > 0;
    if (form.value_mode === 'fixed' && !hasValue) {
      errors['value'] = 'Enter an amount, or let the dispatcher enter one per order.';
    } else if (form.value.trim() && !hasValue) {
      errors['value'] = 'Enter a number greater than 0.';
    } else if (hasValue && form.kind === 'percentage' && value > 100) {
      errors['value'] = 'A percentage cannot be more than 100.';
    }

    if (form.starts_at && form.ends_at && form.starts_at >= form.ends_at) {
      errors['ends_at'] = 'The end date must come after the start.';
    }
    return errors;
  }

  /** The message to show under a field, once it is due to be shown. */
  fieldError(field: string): string | null {
    if (!this.touched[field] && !this.saveAttempted) return null;
    return this.fieldErrors()[field] ?? null;
  }

  hasError(field: string): boolean {
    return !!this.fieldError(field);
  }

  /** Terms are read-only once the discount has been given to someone. */
  get termsLocked(): boolean {
    return (this.discountForm?.redemption_count ?? 0) > 0;
  }

  get valueLabel(): string {
    const kind = this.discountForm?.kind;
    if (kind === 'percentage') return 'Percentage off (%)';
    return 'Amount off (C$)';
  }

  /** Non-null while anything still needs fixing, which keeps Save disabled. */
  discountFormError(): string | null {
    if (this.scheduleEditor?.hasErrors()) return 'Fix the schedule above.';
    const errors = Object.values(this.fieldErrors());
    return errors.length ? errors[0] : null;
  }

  async saveDiscount(): Promise<void> {
    const form = this.discountForm;
    this.saveAttempted = true;
    if (!form || this.discountFormError()) return;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      const payload = this.toDiscountPayload(form);
      if (form.id) {
        // Locked terms are left out so an edit of the naming still saves.
        const editable = this.termsLocked ? this.withoutTerms(payload) : payload;
        await firstValueFrom(this.service.updateDiscount(form.id, editable));
      } else {
        await firstValueFrom(this.service.createDiscount(payload));
      }
      this.toast.success(`${payload.title} saved.`);
      this.discountForm = null;
      await this.load();
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to save this discount.'));
    } finally {
      this.isSaving = false;
    }
  }

  requestDelete(kind: 'discount' | 'type', id: string, name: string): void {
    this.deleteTarget = { kind, id, name };
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget;
    if (!target) return;
    this.isDeleting = true;
    try {
      await firstValueFrom(
        target.kind === 'discount'
          ? this.service.deleteDiscount(target.id)
          : this.service.deleteType(target.id),
      );
      this.toast.success(`${target.name} deleted.`);
      this.deleteTarget = null;
      await this.load();
    } catch (error) {
      this.toast.error(this.errorText(error, `Unable to delete ${target.name}.`));
    } finally {
      this.isDeleting = false;
    }
  }

  // ── Type editor ──────────────────────────────────────────────────────────
  openType(type?: DiscountType): void {
    this.errorMessage = '';
    this.typeForm = type
      ? { id: type.id, title: type.title, description: type.description ?? '' }
      : { id: null, title: '', description: '' };
  }

  closeType(): void {
    this.typeForm = null;
  }

  async saveType(): Promise<void> {
    const form = this.typeForm;
    if (!form || !form.title.trim()) return;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      const payload = { title: form.title.trim(), description: form.description.trim() || null };
      if (form.id) await firstValueFrom(this.service.updateType(form.id, payload));
      else await firstValueFrom(this.service.createType(payload));
      this.toast.success(`${payload.title} saved.`);
      this.typeForm = null;
      await this.load();
    } catch (error) {
      this.toast.error(this.errorText(error, 'Unable to save this discount type.'));
    } finally {
      this.isSaving = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  /** The shared inputs emit strings, so every number is parsed here. */
  private toDiscountPayload(form: DiscountForm): DiscountInput {
    return {
      title: form.title.trim(),
      public_label: form.public_label.trim() || null,
      description: form.description.trim() || null,
      discount_type_id: form.discount_type_id || null,
      kind: form.kind,
      value_mode: form.value_mode,
      value: form.value.trim() ? Number(form.value) : null,
      schedule: form.schedule,
      trigger: form.trigger,
      status: form.status,
      reason: form.reason || null,
      max_discount_amount: this.optionalNumber(form.max_discount_amount),
      min_gross_fee: this.optionalNumber(form.min_gross_fee),
      min_net_fee: Number(form.min_net_fee) || 0,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      usage_limit_total: this.optionalNumber(form.usage_limit_total),
    };
  }

  private withoutTerms(payload: DiscountInput): Partial<DiscountInput> {
    const {
      kind,
      value,
      value_mode,
      max_discount_amount,
      min_gross_fee,
      min_net_fee,
      ...rest
    } = payload;
    return rest;
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
