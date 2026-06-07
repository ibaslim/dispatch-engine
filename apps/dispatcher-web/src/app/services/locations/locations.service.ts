import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Country {
  id: string;
  name: string;
  code: string;
}

export interface State {
  id: string;
  name: string;
  country_id: string;
}

export interface City {
  id: string;
  name: string;
  state_id: string;
}

export interface CityPricing {
  id: string;
  city_id: string;
  city_name: string;
  state_name: string;
  country_name: string;
  partner_price_per_km: number | null;
  partner_price_per_kg: number | null;
  individual_price_per_km: number | null;
  individual_price_per_kg: number | null;
}

export interface PricingUpsertRequest {
  city_ids: string[];
  partner_price_per_km: number | null;
  partner_price_per_kg: number | null;
  individual_price_per_km: number | null;
  individual_price_per_kg: number | null;
}

const BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly http = inject(HttpClient);

  getCountries(): Observable<Country[]> {
    return this.http.get<Country[]>(`${BASE}/locations/countries`);
  }

  getStates(countryId: string): Observable<State[]> {
    return this.http.get<State[]>(`${BASE}/locations/countries/${countryId}/states`);
  }

  getCities(stateId: string): Observable<City[]> {
    return this.http.get<City[]>(`${BASE}/locations/states/${stateId}/cities`);
  }

  // Pricing
  getAllPricing(): Observable<CityPricing[]> {
    return this.http.get<CityPricing[]>(`${BASE}/pricing`);
  }

  upsertPricing(req: PricingUpsertRequest): Observable<{ updated: string[] }> {
    return this.http.post<{ updated: string[] }>(`${BASE}/pricing/upsert`, req);
  }

  deletePricing(cityId: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/pricing/${cityId}`);
  }
}
