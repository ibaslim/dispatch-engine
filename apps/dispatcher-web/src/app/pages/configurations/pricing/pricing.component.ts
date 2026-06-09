import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  LocationsService,
  Country,
  State,
  City,
  CityPricing,
} from '../../../services/locations/locations.service';
import { SideDrawerComponent } from '../../../components/side-drawer/Side-drawer.component';
import { SearchBarComponent } from '../../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../../components/button/button.component';

type DrawerMode = 'add' | 'edit';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SideDrawerComponent,
    SearchBarComponent,
    ButtonComponent,
  ],
  templateUrl: './pricing.component.html',
})
export class PricingComponent implements OnInit {
  private readonly locationsSvc = inject(LocationsService);

  // ── Table data ─────────────────────────────────────────────────────────────
  pricingRows: CityPricing[] = [];
  isLoadingTable = false;
  tableError = '';

  // ── Settings drawer ────────────────────────────────────────────────────────
  isDrawerOpen = false;
  addPanelOpen = true;
  editPanelOpen = false;

  // ── Shared location data ───────────────────────────────────────────────────
  countries: Country[] = [];
  // Add-panel state
  addCountryId = '';
  addStates: State[] = [];
  addSelectedStateIds: string[] = [];
  addCities: City[] = [];   // cities for ALL selected states combined
  addSelectedCityIds: string[] = [];

  // Edit-panel state (select a single existing pricing row to edit)
  editRowId = '';          // city_id of the row being edited
  editCountryId = '';
  editStates: State[] = [];
  editSelectedStateIds: string[] = [];
  editCities: City[] = [];
  editSelectedCityIds: string[] = [];

  // ── Pricing fields (shared between add/edit – each panel has its own) ──────
  // Add
  addPartnerKm: number | null = null;
  addPartnerKg: number | null = null;
  addIndivKm: number | null = null;
  addIndivKg: number | null = null;

  // Edit
  editPartnerKm: number | null = null;
  editPartnerKg: number | null = null;
  editIndivKm: number | null = null;
  editIndivKg: number | null = null;

  // ── Search / filter ────────────────────────────────────────────────────────
  searchQuery = '';

  // ── Feedback ──────────────────────────────────────────────────────────────
  isSavingAdd = false;
  isSavingEdit = false;
  addError = '';
  addSuccess = '';
  editError = '';
  editSuccess = '';

  // ── Delete ────────────────────────────────────────────────────────────────
  deletingCityId: string | null = null;

  get filteredRows(): CityPricing[] {
    if (!this.searchQuery.trim()) return this.pricingRows;
    const q = this.searchQuery.toLowerCase();
    return this.pricingRows.filter(
      (r) =>
        r.city_name.toLowerCase().includes(q) ||
        r.state_name.toLowerCase().includes(q) ||
        r.country_name.toLowerCase().includes(q)
    );
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadTable(), this.loadCountries()]);
  }

  async loadTable(): Promise<void> {
    this.isLoadingTable = true;
    this.tableError = '';
    try {
      this.pricingRows = await firstValueFrom(this.locationsSvc.getAllPricing());
    } catch {
      this.tableError = 'Failed to load pricing data.';
    } finally {
      this.isLoadingTable = false;
    }
  }

  async loadCountries(): Promise<void> {
    try {
      this.countries = await firstValueFrom(this.locationsSvc.getCountries());
    } catch {
      // silent – countries are only needed when drawer is open
    }
  }

  openDrawer(): void {
    this.isDrawerOpen = true;
    this.resetAddForm();
    this.resetEditForm();
  }

  closeDrawer(): void {
    this.isDrawerOpen = false;
  }

  toggleAddPanel(): void {
    this.addPanelOpen = !this.addPanelOpen;
  }

  toggleEditPanel(): void {
    this.editPanelOpen = !this.editPanelOpen;
  }

  // ─── Add panel ────────────────────────────────────────────────────────────

  async onAddCountryChange(): Promise<void> {
    this.addStates = [];
    this.addSelectedStateIds = [];
    this.addCities = [];
    this.addSelectedCityIds = [];
    if (!this.addCountryId) return;
    this.addStates = await firstValueFrom(this.locationsSvc.getStates(this.addCountryId));
  }

  isAllStatesSelected(): boolean {
    return this.addStates.length > 0 && this.addSelectedStateIds.length === this.addStates.length;
  }

  toggleAllStates(): void {
    if (this.isAllStatesSelected()) {
      this.addSelectedStateIds = [];
      this.addCities = [];
      this.addSelectedCityIds = [];
    } else {
      this.addSelectedStateIds = this.addStates.map((s) => s.id);
      this.onAddStatesChange();
    }
  }

  toggleState(stateId: string): void {
    const idx = this.addSelectedStateIds.indexOf(stateId);
    if (idx >= 0) {
      this.addSelectedStateIds.splice(idx, 1);
    } else {
      this.addSelectedStateIds.push(stateId);
    }
    this.onAddStatesChange();
  }

  isStateSelected(stateId: string): boolean {
    return this.addSelectedStateIds.includes(stateId);
  }

  async onAddStatesChange(): Promise<void> {
    this.addCities = [];
    this.addSelectedCityIds = [];
    if (!this.addSelectedStateIds.length) return;
    const results = await Promise.all(
      this.addSelectedStateIds.map((sid) =>
        firstValueFrom(this.locationsSvc.getCities(sid))
      )
    );
    this.addCities = results.flat();
  }

  isAllCitiesSelected(): boolean {
    return this.addCities.length > 0 && this.addSelectedCityIds.length === this.addCities.length;
  }

  toggleAllCities(): void {
    if (this.isAllCitiesSelected()) {
      this.addSelectedCityIds = [];
    } else {
      this.addSelectedCityIds = this.addCities.map((c) => c.id);
    }
  }

  toggleCity(cityId: string): void {
    const idx = this.addSelectedCityIds.indexOf(cityId);
    if (idx >= 0) {
      this.addSelectedCityIds.splice(idx, 1);
    } else {
      this.addSelectedCityIds.push(cityId);
    }
  }

  isCitySelected(cityId: string): boolean {
    return this.addSelectedCityIds.includes(cityId);
  }

  sameAsPartnerAdd(): void {
    this.addIndivKm = this.addPartnerKm;
    this.addIndivKg = this.addPartnerKg;
  }

  async saveAdd(): Promise<void> {
    this.addError = '';
    this.addSuccess = '';
    if (!this.addSelectedCityIds.length) {
      this.addError = 'Please select at least one city.';
      return;
    }
    this.isSavingAdd = true;
    try {
      await firstValueFrom(
        this.locationsSvc.upsertPricing({
          city_ids: this.addSelectedCityIds,
          partner_price_per_km: this.addPartnerKm,
          partner_price_per_kg: this.addPartnerKg,
          individual_price_per_km: this.addIndivKm,
          individual_price_per_kg: this.addIndivKg,
        })
      );
      this.addSuccess = `Pricing saved for ${this.addSelectedCityIds.length} city/cities.`;
      await this.loadTable();
      this.resetAddForm();
    } catch {
      this.addError = 'Failed to save pricing. Please try again.';
    } finally {
      this.isSavingAdd = false;
    }
  }

  resetAddForm(): void {
    this.addCountryId = '';
    this.addStates = [];
    this.addSelectedStateIds = [];
    this.addCities = [];
    this.addSelectedCityIds = [];
    this.addPartnerKm = null;
    this.addPartnerKg = null;
    this.addIndivKm = null;
    this.addIndivKg = null;
    this.addError = '';
    this.addSuccess = '';
  }

  // ─── Edit panel ───────────────────────────────────────────────────────────

  startEdit(row: CityPricing): void {
    this.editPanelOpen = true;
    this.addPanelOpen = false;
    this.isDrawerOpen = true;
    this.editRowId = row.city_id;
    this.editPartnerKm = row.partner_price_per_km;
    this.editPartnerKg = row.partner_price_per_kg;
    this.editIndivKm = row.individual_price_per_km;
    this.editIndivKg = row.individual_price_per_kg;
    this.editError = '';
    this.editSuccess = '';
  }

  sameAsPartnerEdit(): void {
    this.editIndivKm = this.editPartnerKm;
    this.editIndivKg = this.editPartnerKg;
  }

  async saveEdit(): Promise<void> {
    this.editError = '';
    this.editSuccess = '';
    if (!this.editRowId) {
      this.editError = 'No city selected to edit.';
      return;
    }
    this.isSavingEdit = true;
    try {
      await firstValueFrom(
        this.locationsSvc.upsertPricing({
          city_ids: [this.editRowId],
          partner_price_per_km: this.editPartnerKm,
          partner_price_per_kg: this.editPartnerKg,
          individual_price_per_km: this.editIndivKm,
          individual_price_per_kg: this.editIndivKg,
        })
      );
      this.editSuccess = 'Pricing updated successfully.';
      await this.loadTable();
    } catch {
      this.editError = 'Failed to update pricing. Please try again.';
    } finally {
      this.isSavingEdit = false;
    }
  }

  resetEditForm(): void {
    this.editRowId = '';
    this.editCountryId = '';
    this.editStates = [];
    this.editSelectedStateIds = [];
    this.editCities = [];
    this.editSelectedCityIds = [];
    this.editPartnerKm = null;
    this.editPartnerKg = null;
    this.editIndivKm = null;
    this.editIndivKg = null;
    this.editError = '';
    this.editSuccess = '';
  }

  getEditingCityName(): string {
    const row = this.pricingRows.find((r) => r.city_id === this.editRowId);
    return row ? `${row.city_name}, ${row.state_name}` : 'Selected city';
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteRow(cityId: string): Promise<void> {
    if (!confirm('Remove pricing for this city?')) return;
    this.deletingCityId = cityId;
    try {
      await firstValueFrom(this.locationsSvc.deletePricing(cityId));
      this.pricingRows = this.pricingRows.filter((r) => r.city_id !== cityId);
    } catch {
      alert('Failed to delete pricing.');
    } finally {
      this.deletingCityId = null;
    }
  }

  formatPrice(val: number | null): string {
    if (val === null || val === undefined) return '—';
    return `$${val.toFixed(2)}`;
  }
}
