import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const BASE = '/api/v1/configurations';

export interface ZoneCity {
  id: string;
  name: string;
  state_id: string;
  state_name: string;
}

export interface OperationalZone {
  id: string;
  name: string;
  radius_km: number;
  cities: ZoneCity[];
}

export interface DeliveryCategory {
  id: string;
  name: string;
  description: string;
}

export interface AfterHoursDelivery {
  id: string;
  start_time: string;
  end_time: string;
  extra_amount: number;
}

export interface ZoneBasePrice {
  id: string;
  zone_id: string;
  zone_name: string;
  category_id: string;
  category_name: string;
  individual_price: number;
  partner_price: number;
  individual_out_of_radius_per_km: number;
  partner_out_of_radius_per_km: number;
  partner_overrides: PartnerPriceOverride[];
}

export interface PartnerPriceOverride {
  id: string;
  partner_id: string;
  partner_name: string;
  price: number;
  out_of_radius_per_km: number;
}

export interface Surcharge {
  id: string;
  name: string;
  extra_amount: number;
}

export interface SpecialOccasion {
  id: string;
  name: string;
  occasion_date: string;
  repeats_annually: boolean;
}

@Injectable({ providedIn: 'root' })
export class DeliveryConfigurationService {
  private readonly http = inject(HttpClient);

  getZones(): Observable<OperationalZone[]> {
    return this.http.get<OperationalZone[]>(`${BASE}/operational-zones`);
  }
  createZone(payload: { name: string; city_ids: string[] }): Observable<OperationalZone> {
    return this.http.post<OperationalZone>(`${BASE}/operational-zones`, payload);
  }
  updateZone(id: string, payload: { name: string; city_ids: string[] }): Observable<OperationalZone> {
    return this.http.put<OperationalZone>(`${BASE}/operational-zones/${id}`, payload);
  }
  deleteZone(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/operational-zones/${id}`);
  }

  getCategories(): Observable<DeliveryCategory[]> {
    return this.http.get<DeliveryCategory[]>(`${BASE}/delivery-categories`);
  }
  createCategory(payload: Omit<DeliveryCategory, 'id'>): Observable<DeliveryCategory> {
    return this.http.post<DeliveryCategory>(`${BASE}/delivery-categories`, payload);
  }
  updateCategory(id: string, payload: Omit<DeliveryCategory, 'id'>): Observable<DeliveryCategory> {
    return this.http.put<DeliveryCategory>(`${BASE}/delivery-categories/${id}`, payload);
  }
  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/delivery-categories/${id}`);
  }

  getAfterHours(): Observable<AfterHoursDelivery[]> {
    return this.http.get<AfterHoursDelivery[]>(`${BASE}/after-hours`);
  }
  createAfterHours(payload: Omit<AfterHoursDelivery, 'id'>): Observable<AfterHoursDelivery> {
    return this.http.post<AfterHoursDelivery>(`${BASE}/after-hours`, payload);
  }
  updateAfterHours(id: string, payload: Omit<AfterHoursDelivery, 'id'>): Observable<AfterHoursDelivery> {
    return this.http.put<AfterHoursDelivery>(`${BASE}/after-hours/${id}`, payload);
  }
  deleteAfterHours(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/after-hours/${id}`);
  }

  getBasePrices(): Observable<ZoneBasePrice[]> {
    return this.http.get<ZoneBasePrice[]>(`${BASE}/base-prices`);
  }
  saveBasePrice(
    zoneId: string,
    categoryId: string,
    payload: {
      individual_price: number;
      partner_price: number;
      individual_out_of_radius_per_km: number;
      partner_out_of_radius_per_km: number;
    }
  ): Observable<ZoneBasePrice> {
    return this.http.put<ZoneBasePrice>(
      `${BASE}/base-prices/${zoneId}/${categoryId}`,
      payload
    );
  }
  saveZoneRadius(zoneId: string, radiusKm: number): Observable<{ radius_km: number }> {
    return this.http.put<{ radius_km: number }>(
      `${BASE}/base-prices/zones/${zoneId}/radius`,
      { radius_km: radiusKm }
    );
  }
  savePartnerPriceOverride(
    basePriceId: string,
    partnerId: string,
    payload: { price: number; out_of_radius_per_km: number }
  ): Observable<PartnerPriceOverride> {
    return this.http.put<PartnerPriceOverride>(
      `${BASE}/base-prices/${basePriceId}/partner-overrides/${partnerId}`,
      payload
    );
  }
  deletePartnerPriceOverride(basePriceId: string, partnerId: string): Observable<void> {
    return this.http.delete<void>(
      `${BASE}/base-prices/${basePriceId}/partner-overrides/${partnerId}`
    );
  }

  getSurcharges(): Observable<Surcharge[]> {
    return this.http.get<Surcharge[]>(`${BASE}/surcharges`);
  }
  createSurcharge(payload: Omit<Surcharge, 'id'>): Observable<Surcharge> {
    return this.http.post<Surcharge>(`${BASE}/surcharges`, payload);
  }
  updateSurcharge(id: string, payload: Omit<Surcharge, 'id'>): Observable<Surcharge> {
    return this.http.put<Surcharge>(`${BASE}/surcharges/${id}`, payload);
  }
  deleteSurcharge(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/surcharges/${id}`);
  }

  getSpecialOccasions(): Observable<SpecialOccasion[]> {
    return this.http.get<SpecialOccasion[]>(`${BASE}/special-occasions`);
  }
  createSpecialOccasion(payload: Omit<SpecialOccasion, 'id'>): Observable<SpecialOccasion> {
    return this.http.post<SpecialOccasion>(`${BASE}/special-occasions`, payload);
  }
  updateSpecialOccasion(
    id: string,
    payload: Omit<SpecialOccasion, 'id'>
  ): Observable<SpecialOccasion> {
    return this.http.put<SpecialOccasion>(`${BASE}/special-occasions/${id}`, payload);
  }
  deleteSpecialOccasion(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/special-occasions/${id}`);
  }
}
