import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { PopupComponent } from '../../../components/popup/popup.component';
import { SearchBarComponent } from '../../../components/search-bar/search-bar.component';
import {
  DriverPayrollCity,
  DriverPayrollRates,
  DriverPayrollState,
  DriversService,
  PayrollDriver,
} from '../../../services/drivers/drivers.service';

interface DriverPayrollView {
  driver: PayrollDriver;
  defaultRates: DriverPayrollRates;
  states: DriverPayrollState[];
  expanded: boolean;
  loading: boolean;
  loaded: boolean;
  expandedStateIds: Set<string>;
}

type PayrollTarget =
  | { type: 'driver'; view: DriverPayrollView }
  | { type: 'state'; view: DriverPayrollView; state: DriverPayrollState }
  | {
      type: 'city';
      view: DriverPayrollView;
      state: DriverPayrollState;
      city: DriverPayrollCity;
    };

@Component({
  selector: 'app-driver-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent, SearchBarComponent],
  templateUrl: './driver-payroll.component.html',
})
export class DriverPayrollComponent implements OnInit {
  private readonly driversService = inject(DriversService);

  driverViews: DriverPayrollView[] = [];
  savingIds = new Set<string>();
  confirmationTarget: PayrollTarget | null = null;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  searchQuery = '';

  get filteredDriverViews(): DriverPayrollView[] {
    const query = this.normalizedSearchQuery();
    if (!query) return this.driverViews;
    return this.driverViews.filter((view) => this.driverHasSearchMatch(view));
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const drivers = await firstValueFrom(this.driversService.getPayrollDrivers());
      this.driverViews = drivers.map((driver) => ({
        driver,
        defaultRates: this.emptyRates(),
        states: [],
        expanded: false,
        loading: false,
        loaded: false,
        expandedStateIds: new Set<string>(),
      }));
    } catch {
      this.errorMessage = 'Failed to load drivers.';
    } finally {
      this.isLoading = false;
    }
  }

  async toggleDriver(view: DriverPayrollView): Promise<void> {
    view.expanded = !view.expanded;
    if (view.expanded && !view.loaded) {
      await this.loadDriver(view);
    }
  }

  async loadDriver(view: DriverPayrollView): Promise<void> {
    view.loading = true;
    this.errorMessage = '';
    try {
      [view.defaultRates, view.states] = await Promise.all([
        firstValueFrom(this.driversService.getDriverDefaultRates(view.driver.id)),
        firstValueFrom(this.driversService.getDriverCanadianRates(view.driver.id)),
      ]);
      view.loaded = true;
    } catch {
      this.errorMessage = `Failed to load payroll compensation for ${view.driver.name}.`;
    } finally {
      view.loading = false;
    }
  }

  async onSearchChange(value: string): Promise<void> {
    this.searchQuery = value;
    if (this.normalizedSearchQuery()) {
      await this.loadAllDrivers();
    }
  }

  toggleState(view: DriverPayrollView, stateId: string): void {
    if (view.expandedStateIds.has(stateId)) {
      view.expandedStateIds.delete(stateId);
    } else {
      view.expandedStateIds.add(stateId);
    }
  }

  isDriverExpanded(view: DriverPayrollView): boolean {
    return view.expanded || this.driverHasSearchMatch(view);
  }

  isStateExpanded(view: DriverPayrollView, state: DriverPayrollState): boolean {
    return view.expandedStateIds.has(state.state_id) || this.hasCityMatch(state);
  }

  visibleStates(view: DriverPayrollView): DriverPayrollState[] {
    const query = this.normalizedSearchQuery();
    if (query && view.driver.name.toLowerCase().includes(query)) {
      return view.states;
    }
    if (!query) return view.states;
    return view.states.filter(
      (state) =>
        state.state_name.toLowerCase().includes(query) ||
        state.cities.some((city) => city.city_name.toLowerCase().includes(query))
    );
  }

  visibleCities(state: DriverPayrollState): DriverPayrollCity[] {
    const query = this.normalizedSearchQuery();
    if (!query || state.state_name.toLowerCase().includes(query)) {
      return state.cities;
    }
    return state.cities.filter((city) => city.city_name.toLowerCase().includes(query));
  }

  requestDriverOverride(view: DriverPayrollView): void {
    if (this.validateRates(view.defaultRates, view.driver.name)) {
      this.confirmationTarget = { type: 'driver', view };
    }
  }

  requestStateOverride(view: DriverPayrollView, state: DriverPayrollState): void {
    if (this.validateRates(state, `${state.state_name} for ${view.driver.name}`)) {
      this.confirmationTarget = { type: 'state', view, state };
    }
  }

  requestCityOverride(
    view: DriverPayrollView,
    state: DriverPayrollState,
    city: DriverPayrollCity
  ): void {
    if (this.validateRates(city, `${city.city_name} for ${view.driver.name}`)) {
      this.confirmationTarget = { type: 'city', view, state, city };
    }
  }

  closeConfirmation(): void {
    if (!this.isConfirmationSaving()) {
      this.confirmationTarget = null;
    }
  }

  async confirmOverride(): Promise<void> {
    const target = this.confirmationTarget;
    if (!target) return;
    const savingId = this.targetSavingId(target);
    this.savingIds.add(savingId);
    this.clearFeedback();
    try {
      await this.saveTarget(target);
      this.confirmationTarget = null;
    } catch {
      this.errorMessage = `Failed to update payroll compensation for ${this.targetName()}.`;
    } finally {
      this.savingIds.delete(savingId);
    }
  }

  confirmationMessage(): string {
    const target = this.confirmationTarget;
    if (!target) return '';
    if (target.type === 'driver') {
      return `Are you sure you want to update general payroll compensation for ${target.view.driver.name}? This will replace all province and city values for this driver.`;
    }
    if (target.type === 'state') {
      return `Are you sure you want to update ${target.state.state_name} payroll compensation for ${target.view.driver.name}? This will replace all city values in the province for this driver.`;
    }
    return `Are you sure you want to update ${target.city.city_name} payroll compensation for ${target.view.driver.name}?`;
  }

  targetName(): string {
    const target = this.confirmationTarget;
    if (!target) return '';
    if (target.type === 'driver') return target.view.driver.name;
    if (target.type === 'state') return target.state.state_name;
    return target.city.city_name;
  }

  isSaving(id: string): boolean {
    return this.savingIds.has(id);
  }

  isConfirmationSaving(): boolean {
    return this.confirmationTarget
      ? this.isSaving(this.targetSavingId(this.confirmationTarget))
      : false;
  }

  driverSavingId(view: DriverPayrollView): string {
    return `driver:${view.driver.id}:default`;
  }

  stateSavingId(view: DriverPayrollView, state: DriverPayrollState): string {
    return `driver:${view.driver.id}:state:${state.state_id}`;
  }

  citySavingId(view: DriverPayrollView, city: DriverPayrollCity): string {
    return `driver:${view.driver.id}:city:${city.city_id}`;
  }

  private async saveTarget(target: PayrollTarget): Promise<void> {
    if (target.type === 'driver') {
      const rates = this.toRates(target.view.defaultRates);
      await firstValueFrom(
        this.driversService.updateDriverDefaultRates(target.view.driver.id, rates)
      );
      target.view.states.forEach((state) => {
        Object.assign(state, rates);
        state.cities.forEach((city) => Object.assign(city, rates));
      });
      this.successMessage = `${target.view.driver.name}'s general payroll compensation was updated.`;
      return;
    }
    if (target.type === 'state') {
      const rates = this.toRates(target.state);
      await firstValueFrom(
        this.driversService.updateDriverStateRates(
          target.view.driver.id,
          target.state.state_id,
          rates
        )
      );
      target.state.cities.forEach((city) => Object.assign(city, rates));
      this.successMessage = `${target.state.state_name} payroll compensation for ${target.view.driver.name} was updated.`;
      return;
    }
    await firstValueFrom(
      this.driversService.updateDriverCityRates(
        target.view.driver.id,
        target.city.city_id,
        this.toRates(target.city)
      )
    );
    this.successMessage = `${target.city.city_name} payroll compensation for ${target.view.driver.name} was updated.`;
  }

  private async loadAllDrivers(): Promise<void> {
    await Promise.all(
      this.driverViews
        .filter((view) => !view.loaded && !view.loading)
        .map((view) => this.loadDriver(view))
    );
  }

  private driverHasSearchMatch(view: DriverPayrollView): boolean {
    const query = this.normalizedSearchQuery();
    if (!query) return false;
    return (
      view.driver.name.toLowerCase().includes(query) ||
      view.states.some(
        (state) =>
          state.state_name.toLowerCase().includes(query) ||
          state.cities.some((city) => city.city_name.toLowerCase().includes(query))
      )
    );
  }

  private hasCityMatch(state: DriverPayrollState): boolean {
    const query = this.normalizedSearchQuery();
    return !!query && state.cities.some((city) => city.city_name.toLowerCase().includes(query));
  }

  private validateRates(rates: DriverPayrollRates, name: string): boolean {
    this.clearFeedback();
    const valid = [rates.base_salary, rates.commission_per_delivery].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
    );
    if (!valid) {
      this.errorMessage = `Enter valid non-negative payroll values for ${name}.`;
    }
    return valid;
  }

  private targetSavingId(target: PayrollTarget): string {
    if (target.type === 'driver') return this.driverSavingId(target.view);
    if (target.type === 'state') return this.stateSavingId(target.view, target.state);
    return this.citySavingId(target.view, target.city);
  }

  private toRates(rates: DriverPayrollRates): DriverPayrollRates {
    return {
      base_salary: rates.base_salary,
      commission_per_delivery: rates.commission_per_delivery,
    };
  }

  private clearFeedback(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private normalizedSearchQuery(): string {
    return this.searchQuery.trim().toLowerCase();
  }

  private emptyRates(): DriverPayrollRates {
    return { base_salary: 200, commission_per_delivery: 0 };
  }
}
