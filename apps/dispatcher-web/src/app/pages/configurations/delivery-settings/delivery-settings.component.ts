import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';

import { PopupComponent } from '@components/popup/popup.component';
import {
  AfterHoursDelivery,
  DeliveryCategory,
  DeliveryConfigurationService,
  OperationalZone,
  PartnerPriceOverride,
  SpecialOccasion,
  Surcharge,
  ZoneBasePrice,
} from '@services/delivery-configuration/delivery-configuration.service';
import {
  City,
  LocationsService,
  PricingPartner,
  State,
} from '@services/locations/locations.service';

type Section = 'regions' | 'categories' | 'after-hours' | 'base-prices' | 'surcharges';
type Modal =
  | 'zone'
  | 'category'
  | 'after-hours'
  | 'surcharge'
  | 'occasion'
  | null;
type DeleteKind = 'zone' | 'category' | 'after-hours' | 'surcharge' | 'occasion';

interface BasePriceRow {
  zone: OperationalZone;
  category: DeliveryCategory;
  basePriceId: string | null;
  individual_price: number | null;
  partner_price: number | null;
  individual_out_of_radius_per_km: number | null;
  partner_out_of_radius_per_km: number | null;
  partner_overrides: PartnerPriceOverride[];
  saving: boolean;
}

interface ZonePricingGroup {
  zone: OperationalZone;
  rows: BasePriceRow[];
  radius_km: number;
  savingRadius: boolean;
}

interface PartnerMatrixRow {
  base: BasePriceRow;
  price: number;
  out_of_radius_per_km: number;
  hasOverride: boolean;
  saving: boolean;
}

interface SelectedZoneCity {
  id: string;
  name: string;
  stateName: string;
}

@Component({
  selector: 'app-delivery-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent],
  templateUrl: './delivery-settings.component.html',
  styleUrl: './delivery-settings.component.css',
})
export class DeliverySettingsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(DeliveryConfigurationService);
  private readonly locations = inject(LocationsService);

  readonly section = this.route.snapshot.data['section'] as Section;
  zones: OperationalZone[] = [];
  categories: DeliveryCategory[] = [];
  afterHours: AfterHoursDelivery[] = [];
  basePriceRows: BasePriceRow[] = [];
  basePriceGroups: ZonePricingGroup[] = [];
  expandedPricingZoneIds = new Set<string>();
  surcharges: Surcharge[] = [];
  occasions: SpecialOccasion[] = [];
  partners: PricingPartner[] = [];
  basePricingTab: 'general' | 'partners' = 'general';
  selectedPartnerId = '';
  partnerMatrixRows: PartnerMatrixRow[] = [];
  surchargeTab: 'standard' | 'occasions' = 'standard';
  states: State[] = [];
  cities: City[] = [];
  selectedCityIds = new Set<string>();
  selectedCityDetails = new Map<string, SelectedZoneCity>();

  modal: Modal = null;
  editingId: string | null = null;
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  successMessage = '';
  formError = '';
  deleteTarget: { kind: DeleteKind; id: string; name: string } | null = null;

  zoneForm = { name: '', stateId: '' };
  categoryForm = { name: '', description: '' };
  afterHoursForm = { start_time: '', end_time: '', extra_amount: 0 };
  surchargeForm = { name: '', extra_amount: 0 };
  occasionForm = { name: '', occasion_date: '', repeats_annually: false };

  get pageTitle(): string {
    return {
      regions: 'Operational Regions',
      categories: 'Delivery Categories',
      'after-hours': 'After-Hours Deliveries',
      'base-prices': 'Base Prices',
      surcharges: 'Surcharges',
    }[this.section];
  }

  get pageDescription(): string {
    return {
      regions: 'Group the cities you serve into clear delivery zones.',
      categories: 'Explain the delivery options customers can choose from.',
      'after-hours': 'Set the additional charge for deliveries within specific time ranges.',
      'base-prices': 'Configure zone/category prices, included distance, and per-kilometre charges beyond that radius.',
      surcharges: 'Manage extra charges and date-based special occasions.',
    }[this.section];
  }

  get modalTitle(): string {
    const action = this.editingId ? 'Edit' : 'Add';
    return `${action} ${{
      zone: 'operational zone',
      category: 'delivery category',
      'after-hours': 'after-hours range',
      surcharge: 'surcharge',
      occasion: 'special occasion',
    }[this.modal || 'zone']}`;
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      if (this.section === 'regions') this.zones = await firstValueFrom(this.service.getZones());
      if (this.section === 'categories') {
        this.categories = await firstValueFrom(this.service.getCategories());
      }
      if (this.section === 'after-hours') {
        this.afterHours = await firstValueFrom(this.service.getAfterHours());
      }
      if (this.section === 'base-prices') await this.loadBasePrices();
      if (this.section === 'surcharges') {
        [this.surcharges, this.occasions] = await Promise.all([
          firstValueFrom(this.service.getSurcharges()),
          firstValueFrom(this.service.getSpecialOccasions()),
        ]);
      }
    } catch (error) {
      this.errorMessage = this.errorText(error, `Failed to load ${this.pageTitle.toLowerCase()}.`);
    } finally {
      this.isLoading = false;
    }
  }

  async openZone(zone?: OperationalZone): Promise<void> {
    this.resetModal('zone', zone?.id);
    this.zoneForm = { name: zone?.name || '', stateId: zone?.cities[0]?.state_id || '' };
    this.selectedCityIds = new Set(zone?.cities.map((city) => city.id) || []);
    this.selectedCityDetails = new Map(
      (zone?.cities || []).map((city) => [
        city.id,
        { id: city.id, name: city.name, stateName: city.state_name },
      ])
    );
    try {
      const countries = await firstValueFrom(this.locations.getCountries());
      const canada = countries.find((country) => country.code === 'CA') || countries[0];
      this.states = canada ? await firstValueFrom(this.locations.getStates(canada.id)) : [];
      if (this.zoneForm.stateId) await this.onStateChange();
    } catch (error) {
      this.formError = this.errorText(error, 'Failed to load provinces and cities.');
    }
  }

  async onStateChange(): Promise<void> {
    this.cities = this.zoneForm.stateId
      ? await firstValueFrom(this.locations.getCities(this.zoneForm.stateId))
      : [];
  }

  toggleCity(cityId: string, checked: boolean): void {
    if (checked) {
      const city = this.cities.find((item) => item.id === cityId);
      const state = this.states.find((item) => item.id === city?.state_id);
      if (city) {
        this.selectedCityIds.add(cityId);
        this.selectedCityDetails.set(cityId, {
          id: city.id,
          name: city.name,
          stateName: state?.name || '',
        });
      }
    } else {
      this.removeSelectedCity(cityId);
    }
  }

  get selectedZoneCities(): SelectedZoneCity[] {
    return [...this.selectedCityDetails.values()].sort((a, b) =>
      `${a.stateName}:${a.name}`.localeCompare(`${b.stateName}:${b.name}`)
    );
  }

  removeSelectedCity(cityId: string): void {
    this.selectedCityIds.delete(cityId);
    this.selectedCityDetails.delete(cityId);
  }

  cityAssignment(cityId: string): string {
    return (
      this.zones.find(
        (zone) => zone.id !== this.editingId && zone.cities.some((city) => city.id === cityId)
      )?.name || ''
    );
  }

  openCategory(item?: DeliveryCategory): void {
    this.resetModal('category', item?.id);
    this.categoryForm = { name: item?.name || '', description: item?.description || '' };
  }

  openAfterHours(item?: AfterHoursDelivery): void {
    this.resetModal('after-hours', item?.id);
    this.afterHoursForm = {
      start_time: item?.start_time.slice(0, 5) || '',
      end_time: item?.end_time.slice(0, 5) || '',
      extra_amount: Number(item?.extra_amount || 0),
    };
  }

  openSurcharge(item?: Surcharge): void {
    this.resetModal('surcharge', item?.id);
    this.surchargeForm = { name: item?.name || '', extra_amount: Number(item?.extra_amount || 0) };
  }

  openOccasion(item?: SpecialOccasion): void {
    this.resetModal('occasion', item?.id);
    this.occasionForm = {
      name: item?.name || '',
      occasion_date: item?.occasion_date || '',
      repeats_annually: item?.repeats_annually || false,
    };
  }

  closeModal(): void {
    if (!this.isSaving) this.modal = null;
  }

  async saveModal(): Promise<void> {
    this.formError = '';
    if (!this.validateModal()) return;
    this.isSaving = true;
    try {
      if (this.modal === 'zone') {
        const payload = { name: this.zoneForm.name.trim(), city_ids: [...this.selectedCityIds] };
        const saved = await firstValueFrom(
          this.editingId
            ? this.service.updateZone(this.editingId, payload)
            : this.service.createZone(payload)
        );
        this.replaceOrAdd(this.zones, saved);
      } else if (this.modal === 'category') {
        const payload = {
          name: this.categoryForm.name.trim(),
          description: this.categoryForm.description.trim(),
        };
        const saved = await firstValueFrom(
          this.editingId
            ? this.service.updateCategory(this.editingId, payload)
            : this.service.createCategory(payload)
        );
        this.replaceOrAdd(this.categories, saved);
      } else if (this.modal === 'after-hours') {
        const saved = await firstValueFrom(
          this.editingId
            ? this.service.updateAfterHours(this.editingId, this.afterHoursForm)
            : this.service.createAfterHours(this.afterHoursForm)
        );
        this.replaceOrAdd(this.afterHours, saved);
        this.afterHours.sort((a, b) => a.start_time.localeCompare(b.start_time));
      } else if (this.modal === 'surcharge') {
        const payload = { ...this.surchargeForm, name: this.surchargeForm.name.trim() };
        const saved = await firstValueFrom(
          this.editingId
            ? this.service.updateSurcharge(this.editingId, payload)
            : this.service.createSurcharge(payload)
        );
        this.replaceOrAdd(this.surcharges, saved);
      } else if (this.modal === 'occasion') {
        const payload = { ...this.occasionForm, name: this.occasionForm.name.trim() };
        const saved = await firstValueFrom(
          this.editingId
            ? this.service.updateSpecialOccasion(this.editingId, payload)
            : this.service.createSpecialOccasion(payload)
        );
        this.replaceOrAdd(this.occasions, saved);
        this.occasions.sort((a, b) => a.occasion_date.localeCompare(b.occasion_date));
      }
      this.successMessage = 'Configuration saved successfully.';
      this.modal = null;
    } catch (error) {
      this.formError = this.errorText(error, 'Unable to save this configuration.');
    } finally {
      this.isSaving = false;
    }
  }

  async saveBasePrice(row: BasePriceRow): Promise<void> {
    this.clearFeedback();
    if (
      row.individual_price === null ||
      row.partner_price === null ||
      row.individual_out_of_radius_per_km === null ||
      row.partner_out_of_radius_per_km === null ||
      row.individual_price < 0 ||
      row.partner_price < 0 ||
      row.individual_out_of_radius_per_km < 0 ||
      row.partner_out_of_radius_per_km < 0
    ) {
      this.errorMessage = 'Enter valid non-negative prices.';
      return;
    }
    row.saving = true;
    try {
      await firstValueFrom(
        this.service.saveBasePrice(row.zone.id, row.category.id, {
          individual_price: row.individual_price,
          partner_price: row.partner_price,
          individual_out_of_radius_per_km: row.individual_out_of_radius_per_km,
          partner_out_of_radius_per_km: row.partner_out_of_radius_per_km,
        })
      ).then((saved) => {
        row.basePriceId = saved.id;
        row.partner_overrides = saved.partner_overrides;
      });
      this.successMessage = `${row.zone.name} / ${row.category.name} prices saved.`;
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to save base prices.');
    } finally {
      row.saving = false;
    }
  }

  togglePricingZone(zoneId: string): void {
    if (this.expandedPricingZoneIds.has(zoneId)) {
      this.expandedPricingZoneIds.delete(zoneId);
    } else {
      this.expandedPricingZoneIds.add(zoneId);
    }
  }

  isPricingZoneExpanded(zoneId: string): boolean {
    return this.expandedPricingZoneIds.has(zoneId);
  }

  async saveZoneRadius(group: ZonePricingGroup): Promise<void> {
    this.clearFeedback();
    if (group.radius_km <= 0) {
      this.errorMessage = 'The included radius must be greater than zero.';
      return;
    }
    group.savingRadius = true;
    try {
      await firstValueFrom(
        this.service.saveZoneRadius(group.zone.id, group.radius_km)
      );
      group.zone.radius_km = group.radius_km;
      this.successMessage = `${group.zone.name} radius saved.`;
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to save the zone radius.');
    } finally {
      group.savingRadius = false;
    }
  }

  selectPartner(partnerId: string): void {
    this.selectedPartnerId = partnerId;
    this.partnerMatrixRows = this.basePriceRows.map((base) => {
      const override = base.partner_overrides.find(
        (item) => item.partner_id === partnerId
      );
      return {
        base,
        price: Number(override?.price ?? base.partner_price ?? 0),
        out_of_radius_per_km: Number(
          override?.out_of_radius_per_km ?? base.partner_out_of_radius_per_km ?? 0
        ),
        hasOverride: !!override,
        saving: false,
      };
    });
  }

  async savePartnerMatrixRow(row: PartnerMatrixRow): Promise<void> {
    if (!row.base.basePriceId || !this.selectedPartnerId) return;
    if (row.price < 0 || row.out_of_radius_per_km < 0) {
      this.errorMessage = 'Partner prices must be zero or greater.';
      return;
    }
    row.saving = true;
    this.clearFeedback();
    try {
      const saved = await firstValueFrom(
        this.service.savePartnerPriceOverride(
          row.base.basePriceId,
          this.selectedPartnerId,
          {
            price: row.price,
            out_of_radius_per_km: row.out_of_radius_per_km,
          }
        )
      );
      this.replaceOrAdd(row.base.partner_overrides, saved);
      row.hasOverride = true;
      this.successMessage = `${saved.partner_name}'s custom rate was saved.`;
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to save the partner rate.');
    } finally {
      row.saving = false;
    }
  }

  async resetPartnerMatrixRow(row: PartnerMatrixRow): Promise<void> {
    if (!row.base.basePriceId || !this.selectedPartnerId || !row.hasOverride) return;
    row.saving = true;
    this.clearFeedback();
    try {
      await firstValueFrom(
        this.service.deletePartnerPriceOverride(
          row.base.basePriceId,
          this.selectedPartnerId
        )
      );
      row.base.partner_overrides = row.base.partner_overrides.filter(
        (item) => item.partner_id !== this.selectedPartnerId
      );
      row.price = Number(row.base.partner_price ?? 0);
      row.out_of_radius_per_km = Number(
        row.base.partner_out_of_radius_per_km ?? 0
      );
      row.hasOverride = false;
      this.successMessage = 'Partner rate reset to the default.';
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to reset the partner rate.');
    } finally {
      row.saving = false;
    }
  }

  requestDelete(kind: DeleteKind, id: string, name: string): void {
    this.deleteTarget = { kind, id, name };
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget;
    if (!target) return;
    this.isSaving = true;
    try {
      let request: Observable<void>;
      if (target.kind === 'zone') request = this.service.deleteZone(target.id);
      else if (target.kind === 'category') request = this.service.deleteCategory(target.id);
      else if (target.kind === 'after-hours') request = this.service.deleteAfterHours(target.id);
      else if (target.kind === 'surcharge') request = this.service.deleteSurcharge(target.id);
      else request = this.service.deleteSpecialOccasion(target.id);
      await firstValueFrom(request);
      this.removeDeleted(target.kind, target.id);
      this.successMessage = `${target.name} deleted.`;
      this.deleteTarget = null;
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to delete this configuration.');
      this.deleteTarget = null;
    } finally {
      this.isSaving = false;
    }
  }

  formatTime(value: string): string {
    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isNaN(hours)) return value;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  private async loadBasePrices(): Promise<void> {
    const [zones, categories, prices, partners] = await Promise.all([
      firstValueFrom(this.service.getZones()),
      firstValueFrom(this.service.getCategories()),
      firstValueFrom(this.service.getBasePrices()),
      firstValueFrom(this.locations.getPricingPartners()),
    ]);
    this.partners = partners;
    const byCombination = new Map<string, ZoneBasePrice>(
      prices.map((price) => [`${price.zone_id}:${price.category_id}`, price])
    );
    this.basePriceRows = zones.flatMap((zone) =>
      categories.map((category) => {
        const price = byCombination.get(`${zone.id}:${category.id}`);
        return {
          zone,
          category,
          basePriceId: price?.id || null,
          individual_price: price ? Number(price.individual_price) : null,
          partner_price: price ? Number(price.partner_price) : null,
          individual_out_of_radius_per_km: price
            ? Number(price.individual_out_of_radius_per_km)
            : 0,
          partner_out_of_radius_per_km: price
            ? Number(price.partner_out_of_radius_per_km)
            : 0,
          partner_overrides: price?.partner_overrides || [],
          saving: false,
        };
      })
    );
    this.basePriceGroups = zones.map((zone) => ({
      zone,
      rows: this.basePriceRows.filter((row) => row.zone.id === zone.id),
      radius_km: Number(zone.radius_km),
      savingRadius: false,
    }));
  }

  private resetModal(modal: Modal, editingId?: string): void {
    this.clearFeedback();
    this.modal = modal;
    this.editingId = editingId || null;
    this.formError = '';
  }

  private validateModal(): boolean {
    if (this.modal === 'zone' && (!this.zoneForm.name.trim() || !this.selectedCityIds.size)) {
      this.formError = 'Enter a zone name and choose at least one city.';
    } else if (this.modal === 'category' && (!this.categoryForm.name.trim() || !this.categoryForm.description.trim())) {
      this.formError = 'Enter both a category name and customer-facing description.';
    } else if (
      this.modal === 'after-hours' &&
      (!this.afterHoursForm.start_time || !this.afterHoursForm.end_time ||
        this.afterHoursForm.start_time === this.afterHoursForm.end_time || this.afterHoursForm.extra_amount < 0)
    ) {
      this.formError = 'Enter different start and end times and a valid extra amount.';
    } else if (this.modal === 'surcharge' && (!this.surchargeForm.name.trim() || this.surchargeForm.extra_amount < 0)) {
      this.formError = 'Enter a surcharge name and a valid extra amount.';
    } else if (this.modal === 'occasion' && (!this.occasionForm.name.trim() || !this.occasionForm.occasion_date)) {
      this.formError = 'Enter an occasion name and date.';
    }
    return !this.formError;
  }

  private replaceOrAdd<T extends { id: string }>(items: T[], saved: T): void {
    const index = items.findIndex((item) => item.id === saved.id);
    index >= 0 ? items.splice(index, 1, saved) : items.push(saved);
    items.sort((a, b) => ('name' in a && 'name' in b ? String(a.name).localeCompare(String(b.name)) : 0));
  }

  private removeDeleted(kind: DeleteKind, id: string): void {
    if (kind === 'zone') this.zones = this.zones.filter((item) => item.id !== id);
    if (kind === 'category') this.categories = this.categories.filter((item) => item.id !== id);
    if (kind === 'after-hours') this.afterHours = this.afterHours.filter((item) => item.id !== id);
    if (kind === 'surcharge') this.surcharges = this.surcharges.filter((item) => item.id !== id);
    if (kind === 'occasion') this.occasions = this.occasions.filter((item) => item.id !== id);
  }

  private clearFeedback(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private errorText(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const detail = error.error?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    }
    return fallback;
  }
}
