import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { PopupComponent } from '../../../components/popup/popup.component';
import { SearchBarComponent } from '../../../components/search-bar/search-bar.component';
import {
  CanadianCityPricing,
  CanadianStatePricing,
  LocationsService,
  PartnerRates,
  PricingPartner,
  PricingRates,
} from '../../../services/locations/locations.service';

type PricingScope = 'general' | 'partners';

interface PartnerPricingView {
  partner: PricingPartner;
  defaultRates: PricingRates;
  states: CanadianStatePricing[];
  expanded: boolean;
  loading: boolean;
  loaded: boolean;
  expandedStateIds: Set<string>;
}

type PricingTarget =
  | { type: 'general-default' }
  | { type: 'general-state'; state: CanadianStatePricing }
  | { type: 'general-city'; state: CanadianStatePricing; city: CanadianCityPricing }
  | { type: 'partner-default'; view: PartnerPricingView }
  | { type: 'partner-state'; view: PartnerPricingView; state: CanadianStatePricing }
  | {
      type: 'partner-city';
      view: PartnerPricingView;
      state: CanadianStatePricing;
      city: CanadianCityPricing;
    };

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent, SearchBarComponent],
  templateUrl: './pricing.component.html',
})
export class PricingComponent implements OnInit {
  private readonly locationsSvc = inject(LocationsService);

  scope: PricingScope = 'general';
  states: CanadianStatePricing[] = [];
  defaultRates: PricingRates = this.emptyRates();
  partnerViews: PartnerPricingView[] = [];
  expandedStateIds = new Set<string>();
  savingIds = new Set<string>();
  confirmationTarget: PricingTarget | null = null;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  searchQuery = '';

  get filteredStates(): CanadianStatePricing[] {
    return this.filterStates(this.states);
  }

  get filteredPartnerViews(): PartnerPricingView[] {
    const query = this.normalizedSearchQuery();
    if (!query) return this.partnerViews;
    return this.partnerViews.filter(
      (view) =>
        view.partner.name.toLowerCase().includes(query) ||
        view.states.some(
          (state) =>
            state.state_name.toLowerCase().includes(query) ||
            state.cities.some((city) => city.city_name.toLowerCase().includes(query))
        )
    );
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const [partners, defaultRates, states] = await Promise.all([
        firstValueFrom(this.locationsSvc.getPricingPartners()),
        firstValueFrom(this.locationsSvc.getDefaultPricing()),
        firstValueFrom(this.locationsSvc.getCanadianPricing()),
      ]);
      this.defaultRates = defaultRates;
      this.states = states;
      this.partnerViews = partners.map((partner) => ({
        partner,
        defaultRates: this.emptyRates(),
        states: [],
        expanded: false,
        loading: false,
        loaded: false,
        expandedStateIds: new Set<string>(),
      }));
    } catch {
      this.errorMessage = 'Failed to load Canadian pricing.';
    } finally {
      this.isLoading = false;
    }
  }

  async onScopeChange(): Promise<void> {
    this.confirmationTarget = null;
    this.clearFeedback();
    if (this.scope === 'partners' && this.normalizedSearchQuery()) {
      await this.loadAllPartners();
    }
  }

  async togglePartner(view: PartnerPricingView): Promise<void> {
    view.expanded = !view.expanded;
    if (view.expanded && !view.loaded) {
      await this.loadPartner(view);
    }
  }

  async loadPartner(view: PartnerPricingView): Promise<void> {
    view.loading = true;
    this.errorMessage = '';
    try {
      [view.defaultRates, view.states] = await Promise.all([
        firstValueFrom(this.locationsSvc.getDefaultPricing(view.partner.id)),
        firstValueFrom(this.locationsSvc.getCanadianPricing(view.partner.id)),
      ]);
      view.loaded = true;
    } catch {
      this.errorMessage = `Failed to load pricing for ${view.partner.name}.`;
    } finally {
      view.loading = false;
    }
  }

  async onSearchChange(value: string): Promise<void> {
    this.searchQuery = value;
    if (this.scope === 'partners' && this.normalizedSearchQuery()) {
      await this.loadAllPartners();
    }
  }

  toggleGeneralState(stateId: string): void {
    this.toggleSetValue(this.expandedStateIds, stateId);
  }

  togglePartnerState(view: PartnerPricingView, stateId: string): void {
    this.toggleSetValue(view.expandedStateIds, stateId);
  }

  isGeneralStateExpanded(state: CanadianStatePricing): boolean {
    return this.expandedStateIds.has(state.state_id) || this.hasCityMatch(state);
  }

  isPartnerStateExpanded(view: PartnerPricingView, state: CanadianStatePricing): boolean {
    return view.expandedStateIds.has(state.state_id) || this.hasCityMatch(state);
  }

  isPartnerExpanded(view: PartnerPricingView): boolean {
    return view.expanded || this.partnerHasSearchMatch(view);
  }

  visibleCities(state: CanadianStatePricing): CanadianCityPricing[] {
    const query = this.normalizedSearchQuery();
    if (!query || state.state_name.toLowerCase().includes(query)) {
      return state.cities;
    }
    return state.cities.filter((city) => city.city_name.toLowerCase().includes(query));
  }

  visiblePartnerStates(view: PartnerPricingView): CanadianStatePricing[] {
    const query = this.normalizedSearchQuery();
    if (query && view.partner.name.toLowerCase().includes(query)) {
      return view.states;
    }
    return this.filterStates(view.states);
  }

  requestGeneralDefaultOverride(): void {
    if (this.validateRates(this.defaultRates, 'general Canadian pricing', false)) {
      this.confirmationTarget = { type: 'general-default' };
    }
  }

  requestGeneralStateOverride(state: CanadianStatePricing): void {
    if (this.validateRates(state, state.state_name, false)) {
      this.confirmationTarget = { type: 'general-state', state };
    }
  }

  requestGeneralCityOverride(
    state: CanadianStatePricing,
    city: CanadianCityPricing
  ): void {
    if (this.validateRates(city, city.city_name, false)) {
      this.confirmationTarget = { type: 'general-city', state, city };
    }
  }

  requestPartnerDefaultOverride(view: PartnerPricingView): void {
    if (this.validateRates(view.defaultRates, view.partner.name, true)) {
      this.confirmationTarget = { type: 'partner-default', view };
    }
  }

  requestPartnerStateOverride(
    view: PartnerPricingView,
    state: CanadianStatePricing
  ): void {
    if (this.validateRates(state, `${state.state_name} for ${view.partner.name}`, true)) {
      this.confirmationTarget = { type: 'partner-state', view, state };
    }
  }

  requestPartnerCityOverride(
    view: PartnerPricingView,
    state: CanadianStatePricing,
    city: CanadianCityPricing
  ): void {
    if (this.validateRates(city, `${city.city_name} for ${view.partner.name}`, true)) {
      this.confirmationTarget = { type: 'partner-city', view, state, city };
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
      this.errorMessage = `Failed to update ${this.targetName()}. Please try again.`;
    } finally {
      this.savingIds.delete(savingId);
    }
  }

  confirmationMessage(): string {
    const target = this.confirmationTarget;
    if (!target) return '';
    switch (target.type) {
      case 'general-default':
        return 'Are you sure you want to update the general Canadian prices? This will replace every province and city rate.';
      case 'general-state':
        return `Are you sure you want to update prices for ${target.state.state_name}? This will replace every city rate in the province.`;
      case 'general-city':
        return `Are you sure you want to update prices for ${target.city.city_name}?`;
      case 'partner-default':
        return `Are you sure you want to update general prices for ${target.view.partner.name}? This will replace all of this partner's province and city rates.`;
      case 'partner-state':
        return `Are you sure you want to update ${target.state.state_name} prices for ${target.view.partner.name}? This will replace all city rates in the province for this partner.`;
      case 'partner-city':
        return `Are you sure you want to update ${target.city.city_name} prices for ${target.view.partner.name}?`;
    }
  }

  targetName(): string {
    const target = this.confirmationTarget;
    if (!target) return '';
    switch (target.type) {
      case 'general-default':
        return 'general Canadian pricing';
      case 'general-state':
      case 'partner-state':
        return target.state.state_name;
      case 'general-city':
      case 'partner-city':
        return target.city.city_name;
      case 'partner-default':
        return target.view.partner.name;
    }
  }

  isSaving(id: string): boolean {
    return this.savingIds.has(id);
  }

  isConfirmationSaving(): boolean {
    return this.confirmationTarget
      ? this.isSaving(this.targetSavingId(this.confirmationTarget))
      : false;
  }

  generalDefaultSavingId(): string {
    return 'general:default';
  }

  partnerDefaultSavingId(view: PartnerPricingView): string {
    return `partner:${view.partner.id}:default`;
  }

  generalStateSavingId(state: CanadianStatePricing): string {
    return `general:state:${state.state_id}`;
  }

  generalCitySavingId(city: CanadianCityPricing): string {
    return `general:city:${city.city_id}`;
  }

  partnerStateSavingId(
    view: PartnerPricingView,
    state: CanadianStatePricing
  ): string {
    return `partner:${view.partner.id}:state:${state.state_id}`;
  }

  partnerCitySavingId(view: PartnerPricingView, city: CanadianCityPricing): string {
    return `partner:${view.partner.id}:city:${city.city_id}`;
  }

  private async saveTarget(target: PricingTarget): Promise<void> {
    switch (target.type) {
      case 'general-default': {
        const rates = this.toRates(this.defaultRates);
        await firstValueFrom(this.locationsSvc.updateDefaultPricing(rates));
        this.states.forEach((state) => {
          Object.assign(state, rates);
          state.cities.forEach((city) => Object.assign(city, rates));
        });
        this.successMessage = 'General Canadian pricing was updated.';
        return;
      }
      case 'general-state': {
        const rates = this.toRates(target.state);
        await firstValueFrom(
          this.locationsSvc.updateStatePricing(target.state.state_id, rates)
        );
        target.state.cities.forEach((city) => Object.assign(city, rates));
        this.successMessage = `${target.state.state_name} pricing was updated.`;
        return;
      }
      case 'general-city':
        await firstValueFrom(
          this.locationsSvc.updateCityPricing(
            target.city.city_id,
            this.toRates(target.city)
          )
        );
        this.successMessage = `${target.city.city_name} pricing was updated.`;
        return;
      case 'partner-default': {
        const rates = this.toPartnerRates(target.view.defaultRates);
        await firstValueFrom(
          this.locationsSvc.updatePartnerDefault(target.view.partner.id, rates)
        );
        target.view.states.forEach((state) => {
          this.assignPartnerRates(state, rates);
          state.cities.forEach((city) => this.assignPartnerRates(city, rates));
        });
        this.successMessage = `${target.view.partner.name}'s general pricing was updated.`;
        return;
      }
      case 'partner-state': {
        const rates = this.toPartnerRates(target.state);
        await firstValueFrom(
          this.locationsSvc.updatePartnerState(
            target.view.partner.id,
            target.state.state_id,
            rates
          )
        );
        target.state.cities.forEach((city) => this.assignPartnerRates(city, rates));
        this.successMessage = `${target.state.state_name} pricing for ${target.view.partner.name} was updated.`;
        return;
      }
      case 'partner-city':
        await firstValueFrom(
          this.locationsSvc.updatePartnerCity(
            target.view.partner.id,
            target.city.city_id,
            this.toPartnerRates(target.city)
          )
        );
        this.successMessage = `${target.city.city_name} pricing for ${target.view.partner.name} was updated.`;
    }
  }

  private async loadAllPartners(): Promise<void> {
    await Promise.all(
      this.partnerViews
        .filter((view) => !view.loaded && !view.loading)
        .map((view) => this.loadPartner(view))
    );
  }

  private filterStates(states: CanadianStatePricing[]): CanadianStatePricing[] {
    const query = this.normalizedSearchQuery();
    if (!query) return states;
    return states.filter(
      (state) =>
        state.state_name.toLowerCase().includes(query) ||
        state.cities.some((city) => city.city_name.toLowerCase().includes(query))
    );
  }

  private partnerHasSearchMatch(view: PartnerPricingView): boolean {
    const query = this.normalizedSearchQuery();
    if (!query) return false;
    return (
      view.partner.name.toLowerCase().includes(query) ||
      view.states.some(
        (state) =>
          state.state_name.toLowerCase().includes(query) ||
          state.cities.some((city) => city.city_name.toLowerCase().includes(query))
      )
    );
  }

  private hasCityMatch(state: CanadianStatePricing): boolean {
    const query = this.normalizedSearchQuery();
    return !!query && state.cities.some((city) => city.city_name.toLowerCase().includes(query));
  }

  private validateRates(rates: PricingRates, name: string, partnerOnly: boolean): boolean {
    this.clearFeedback();
    const values = partnerOnly
      ? [rates.partner_price_per_km, rates.partner_price_per_kg]
      : [
          rates.partner_price_per_km,
          rates.partner_price_per_kg,
          rates.individual_price_per_km,
          rates.individual_price_per_kg,
        ];
    const valid = values.every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
    );
    if (!valid) {
      this.errorMessage = `Enter valid non-negative rates for ${name}.`;
    }
    return valid;
  }

  private targetSavingId(target: PricingTarget): string {
    switch (target.type) {
      case 'general-default':
        return this.generalDefaultSavingId();
      case 'general-state':
        return this.generalStateSavingId(target.state);
      case 'general-city':
        return this.generalCitySavingId(target.city);
      case 'partner-default':
        return this.partnerDefaultSavingId(target.view);
      case 'partner-state':
        return this.partnerStateSavingId(target.view, target.state);
      case 'partner-city':
        return this.partnerCitySavingId(target.view, target.city);
    }
  }

  private toggleSetValue(values: Set<string>, id: string): void {
    if (values.has(id)) {
      values.delete(id);
    } else {
      values.add(id);
    }
  }

  private toRates(rates: PricingRates): PricingRates {
    return { ...rates };
  }

  private toPartnerRates(rates: PricingRates): PartnerRates {
    return {
      price_per_km: rates.partner_price_per_km,
      price_per_kg: rates.partner_price_per_kg,
    };
  }

  private assignPartnerRates(target: PricingRates, rates: PartnerRates): void {
    target.partner_price_per_km = rates.price_per_km;
    target.partner_price_per_kg = rates.price_per_kg;
  }

  private clearFeedback(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private normalizedSearchQuery(): string {
    return this.searchQuery.trim().toLowerCase();
  }

  private emptyRates(): PricingRates {
    return {
      partner_price_per_km: 2,
      partner_price_per_kg: 2,
      individual_price_per_km: 2,
      individual_price_per_kg: 2,
    };
  }
}
