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

export interface PricingRates {
  partner_price_per_km: number;
  partner_price_per_kg: number;
  individual_price_per_km: number;
  individual_price_per_kg: number;
}

export interface CanadianCityPricing extends PricingRates {
  city_id: string;
  city_name: string;
}

export interface CanadianStatePricing extends PricingRates {
  state_id: string;
  state_name: string;
  cities: CanadianCityPricing[];
}

export interface PricingPartner {
  id: string;
  name: string;
}

export interface PartnerRates {
  price_per_km: number;
  price_per_kg: number;
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

  getPricingPartners(): Observable<PricingPartner[]> {
    return this.http.get<PricingPartner[]>(`${BASE}/pricing/partners`);
  }

  getDefaultPricing(partnerId?: string): Observable<PricingRates> {
    const query = partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : '';
    return this.http.get<PricingRates>(`${BASE}/pricing/defaults${query}`);
  }

  getCanadianPricing(partnerId?: string): Observable<CanadianStatePricing[]> {
    const query = partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : '';
    return this.http.get<CanadianStatePricing[]>(`${BASE}/pricing/canada${query}`);
  }

  updateDefaultPricing(rates: PricingRates): Observable<{ updated_states: number }> {
    return this.http.put<{ updated_states: number }>(`${BASE}/pricing/defaults`, rates);
  }

  updateStatePricing(
    stateId: string,
    rates: PricingRates
  ): Observable<{ updated_state: string; updated_cities: number }> {
    return this.http.put<{ updated_state: string; updated_cities: number }>(
      `${BASE}/pricing/states/${stateId}`,
      rates
    );
  }

  updateCityPricing(cityId: string, rates: PricingRates): Observable<{ updated_city: string }> {
    return this.http.put<{ updated_city: string }>(
      `${BASE}/pricing/cities/${cityId}`,
      rates
    );
  }

  updatePartnerDefault(
    partnerId: string,
    rates: PartnerRates
  ): Observable<{ updated_partner: string }> {
    return this.http.put<{ updated_partner: string }>(
      `${BASE}/pricing/partners/${partnerId}/defaults`,
      rates
    );
  }

  updatePartnerState(
    partnerId: string,
    stateId: string,
    rates: PartnerRates
  ): Observable<{ updated_state: string; updated_cities: number }> {
    return this.http.put<{ updated_state: string; updated_cities: number }>(
      `${BASE}/pricing/partners/${partnerId}/states/${stateId}`,
      rates
    );
  }

  updatePartnerCity(
    partnerId: string,
    cityId: string,
    rates: PartnerRates
  ): Observable<{ updated_city: string }> {
    return this.http.put<{ updated_city: string }>(
      `${BASE}/pricing/partners/${partnerId}/cities/${cityId}`,
      rates
    );
  }
}
