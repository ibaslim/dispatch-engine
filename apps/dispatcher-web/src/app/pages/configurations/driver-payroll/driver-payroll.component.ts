import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { PopupComponent } from '@components/popup/popup.component';
import { SearchBarComponent } from '@components/search-bar/search-bar.component';
import { ToastService } from '@core/toast/toast.service';
import {
  DriverPaymentGroup,
  DriverProfile,
  DriversService,
  PaymentGroupPayload,
  PaymentRuleType,
} from '@services/drivers/drivers.service';

interface PaymentGroupForm {
  id: string | null;
  name: string;
  ruleType: PaymentRuleType | null;
  fixedAmount: number | null;
  deliveryFeePercentage: number | null;
  platformTipPercentage: number | null;
  driverIds: string[];
}

interface DriverMove {
  driverName: string;
  fromGroup: string;
  toGroup: string;
}

@Component({
  selector: 'app-driver-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent, SearchBarComponent],
  templateUrl: './driver-payroll.component.html',
})
export class DriverPayrollComponent implements OnInit {
  private readonly driversService = inject(DriversService);
  private readonly toast = inject(ToastService);

  readonly exampleDeliveryFee = 20;
  readonly exampleTip = 5;
  groups: DriverPaymentGroup[] = [];
  drivers: DriverProfile[] = [];
  searchQuery = '';
  driverSearchQuery = '';
  isLoading = false;
  isSaving = false;
  formOpen = false;
  pendingMoves: DriverMove[] = [];
  deleteTarget: DriverPaymentGroup | null = null;
  form: PaymentGroupForm = this.emptyForm();

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  get filteredGroups(): DriverPaymentGroup[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.groups;
    return this.groups.filter((group) => [group.name, this.ruleLabel(group.rule_type), ...group.drivers.map((driver) => driver.name)]
      .some((value) => value.toLowerCase().includes(query)));
  }

  get filteredDrivers(): DriverProfile[] {
    const query = this.driverSearchQuery.trim().toLowerCase();
    return this.drivers.filter((driver) => !query || [driver.name, driver.contact_email || '', driver.payment_group_name || '']
      .some((value) => value.toLowerCase().includes(query)));
  }

  get driverFeePayout(): number {
    if (this.form.ruleType === 'fixed') return Number(this.form.fixedAmount || 0);
    return this.exampleDeliveryFee * Number(this.form.deliveryFeePercentage || 0) / 100;
  }

  get driverTipPayout(): number {
    if (this.form.ruleType !== 'passthrough') return 0;
    return this.exampleTip * (100 - Number(this.form.platformTipPercentage || 0)) / 100;
  }

  get totalPayout(): number {
    return this.driverFeePayout + this.driverTipPayout;
  }

  openCreate(): void {
    this.form = this.emptyForm();
    this.driverSearchQuery = '';
    this.formOpen = true;
  }

  openEdit(group: DriverPaymentGroup): void {
    this.form = {
      id: group.id,
      name: group.name,
      ruleType: group.rule_type,
      fixedAmount: group.fixed_amount,
      deliveryFeePercentage: group.delivery_fee_percentage,
      platformTipPercentage: group.platform_tip_percentage,
      driverIds: group.drivers.map((driver) => driver.id),
    };
    this.driverSearchQuery = '';
    this.formOpen = true;
  }

  closeForm(): void {
    if (!this.isSaving && this.pendingMoves.length === 0) this.formOpen = false;
  }

  selectRule(rule: PaymentRuleType): void {
    this.form.ruleType = rule;
  }

  isDriverSelected(id: string): boolean {
    return this.form.driverIds.includes(id);
  }

  toggleDriver(id: string, selected: boolean): void {
    this.form.driverIds = selected
      ? [...this.form.driverIds, id]
      : this.form.driverIds.filter((driverId) => driverId !== id);
  }

  async saveGroup(): Promise<void> {
    if (!this.validateForm()) return;
    const moves = this.driverMoves();
    if (moves.length) {
      this.pendingMoves = moves;
      return;
    }
    await this.persist(false);
  }

  async confirmMoves(): Promise<void> {
    await this.persist(true);
    this.pendingMoves = [];
  }

  closeMoveConfirmation(): void {
    if (!this.isSaving) this.pendingMoves = [];
  }

  async confirmDelete(): Promise<void> {
    if (!this.deleteTarget) return;
    this.isSaving = true;
    try {
      await firstValueFrom(this.driversService.deletePaymentGroup(this.deleteTarget.id));
      this.toast.success(`${this.deleteTarget.name} was deleted.`);
      this.deleteTarget = null;
      await this.loadData(false);
    } catch {
      this.toast.error('Failed to delete the payment group.');
    } finally {
      this.isSaving = false;
    }
  }

  ruleLabel(rule: PaymentRuleType): string {
    return {
      fixed: 'Fixed pay per delivery',
      percentage: 'Order value percentage',
      passthrough: 'Pass-through earnings',
    }[rule];
  }

  groupSummary(group: DriverPaymentGroup): string {
    if (group.rule_type === 'fixed') return `C$${this.money(group.fixed_amount)} per delivery`;
    if (group.rule_type === 'percentage') return `${group.delivery_fee_percentage || 0}% of delivery fees`;
    return `${group.delivery_fee_percentage || 0}% of fees + ${100 - Number(group.platform_tip_percentage || 0)}% of tips`;
  }

  samplePayout(group: DriverPaymentGroup): number {
    if (group.rule_type === 'fixed') return Number(group.fixed_amount || 0);
    const fee = this.exampleDeliveryFee * Number(group.delivery_fee_percentage || 0) / 100;
    const tip = group.rule_type === 'passthrough'
      ? this.exampleTip * (100 - Number(group.platform_tip_percentage || 0)) / 100
      : 0;
    return fee + tip;
  }

  money(value: number | null): string {
    return Number(value || 0).toFixed(2);
  }

  private async loadData(showLoader = true): Promise<void> {
    if (showLoader) this.isLoading = true;
    try {
      [this.groups, this.drivers] = await Promise.all([
        firstValueFrom(this.driversService.getPaymentGroups()),
        firstValueFrom(this.driversService.getDrivers()),
      ]);
    } catch {
      this.toast.error('Failed to load driver payment groups.');
    } finally {
      this.isLoading = false;
    }
  }

  private driverMoves(): DriverMove[] {
    return this.drivers
      .filter((driver) => this.form.driverIds.includes(driver.id)
        && !!driver.payment_group_id
        && driver.payment_group_id !== this.form.id)
      .map((driver) => ({
        driverName: driver.name,
        fromGroup: driver.payment_group_name || 'another group',
        toGroup: this.form.name.trim(),
      }));
  }

  private validateForm(): boolean {
    if (!this.form.name.trim()) {
      this.toast.warning('Enter a payment group name.');
      return false;
    }
    if (!this.form.ruleType) {
      this.toast.warning('Choose a payment rule.');
      return false;
    }
    if (this.form.ruleType === 'fixed' && !this.isNonNegative(this.form.fixedAmount)) {
      this.toast.warning('Enter a valid fixed payment amount.');
      return false;
    }
    if (this.form.ruleType !== 'fixed' && !this.isPercentage(this.form.deliveryFeePercentage)) {
      this.toast.warning('Enter a delivery fee percentage between 0 and 100.');
      return false;
    }
    if (this.form.ruleType === 'passthrough' && !this.isPercentage(this.form.platformTipPercentage)) {
      this.toast.warning('Enter a platform tip percentage between 0 and 100.');
      return false;
    }
    return true;
  }

  private async persist(confirmReassignments: boolean): Promise<void> {
    if (!this.form.ruleType) return;
    this.isSaving = true;
    const payload: PaymentGroupPayload = {
      name: this.form.name.trim(),
      rule_type: this.form.ruleType,
      fixed_amount: this.form.ruleType === 'fixed' ? Number(this.form.fixedAmount) : null,
      delivery_fee_percentage: this.form.ruleType === 'fixed' ? null : Number(this.form.deliveryFeePercentage),
      platform_tip_percentage: this.form.ruleType === 'passthrough' ? Number(this.form.platformTipPercentage) : null,
      driver_ids: this.form.driverIds,
      confirm_reassignments: confirmReassignments,
    };
    try {
      if (this.form.id) {
        await firstValueFrom(this.driversService.updatePaymentGroup(this.form.id, payload));
      } else {
        await firstValueFrom(this.driversService.createPaymentGroup(payload));
      }
      this.toast.success(`${payload.name} was ${this.form.id ? 'updated' : 'created'}.`);
      this.formOpen = false;
      this.pendingMoves = [];
      await this.loadData(false);
    } catch (error) {
      const detail = (error as HttpErrorResponse)?.error?.detail;
      this.toast.error(typeof detail === 'string' ? detail : detail?.message || 'Failed to save the payment group.');
    } finally {
      this.isSaving = false;
    }
  }

  private emptyForm(): PaymentGroupForm {
    return { id: null, name: '', ruleType: null, fixedAmount: null, deliveryFeePercentage: null, platformTipPercentage: null, driverIds: [] };
  }

  private isPercentage(value: number | null): boolean {
    return value !== null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
  }

  private isNonNegative(value: number | null): boolean {
    return value !== null && Number.isFinite(Number(value)) && Number(value) >= 0;
  }
}
