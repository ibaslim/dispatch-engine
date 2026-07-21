import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { TenantDriverEntity } from '../../models/drivers/tenant-driver.model';

@Injectable({ providedIn: 'root' })
export class DriversService {
  private readonly baseUrl = '/api/v1/drivers';
  private readonly payrollUrl = '/api/v1/driver-payroll';

  constructor(private readonly http: HttpClient) { }

  getAvailableDrivers(): Observable<TenantDriverEntity[]> {
    return this.http.get<TenantDriverEntity[]>(`${this.baseUrl}/available`);
  }

  getDrivers(): Observable<DriverProfile[]> {
    return this.http.get<DriverProfile[]>(this.baseUrl);
  }

  getPaymentGroups(): Observable<DriverPaymentGroup[]> {
    return this.http.get<DriverPaymentGroup[]>(`${this.payrollUrl}/groups`);
  }

  createPaymentGroup(payload: PaymentGroupPayload): Observable<DriverPaymentGroup> {
    return this.http.post<DriverPaymentGroup>(`${this.payrollUrl}/groups`, payload);
  }

  updatePaymentGroup(id: string, payload: PaymentGroupPayload): Observable<DriverPaymentGroup> {
    return this.http.put<DriverPaymentGroup>(`${this.payrollUrl}/groups/${id}`, payload);
  }

  deletePaymentGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${this.payrollUrl}/groups/${id}`);
  }

  getPayrollDrivers(): Observable<PayrollDriver[]> {
    return this.http.get<PayrollDriver[]>(`${this.payrollUrl}/drivers`);
  }

  getDriverDefaultRates(driverId: string): Observable<DriverPayrollRates> {
    return this.http.get<DriverPayrollRates>(
      `${this.payrollUrl}/drivers/${driverId}/defaults`
    );
  }

  getDriverCanadianRates(driverId: string): Observable<DriverPayrollState[]> {
    return this.http.get<DriverPayrollState[]>(
      `${this.payrollUrl}/drivers/${driverId}/canada`
    );
  }

  updateDriverDefaultRates(
    driverId: string,
    rates: DriverPayrollRates
  ): Observable<{ updated_driver: string }> {
    return this.http.put<{ updated_driver: string }>(
      `${this.payrollUrl}/drivers/${driverId}/defaults`,
      rates
    );
  }

  updateDriverStateRates(
    driverId: string,
    stateId: string,
    rates: DriverPayrollRates
  ): Observable<{ updated_state: string; updated_cities: number }> {
    return this.http.put<{ updated_state: string; updated_cities: number }>(
      `${this.payrollUrl}/drivers/${driverId}/states/${stateId}`,
      rates
    );
  }

  updateDriverCityRates(
    driverId: string,
    cityId: string,
    rates: DriverPayrollRates
  ): Observable<{ updated_city: string }> {
    return this.http.put<{ updated_city: string }>(
      `${this.payrollUrl}/drivers/${driverId}/cities/${cityId}`,
      rates
    );
  }
}

export type PaymentRuleType = 'fixed' | 'percentage' | 'passthrough';

export interface DriverProfile {
  id: string;
  name: string;
  is_active: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone_country_code: string | null;
  contact_phone_number: string | null;
  address: string | null;
  notes: string | null;
  rating: number;
  vehicle_type: string | null;
  plate_number: string | null;
  is_online: boolean;
  completed_deliveries: number;
  payment_group_id: string | null;
  payment_group_name: string | null;
  payment_rule_type: PaymentRuleType | null;
}

export interface PaymentGroupDriver {
  id: string;
  name: string;
}

export interface DriverPaymentGroup {
  id: string;
  name: string;
  rule_type: PaymentRuleType;
  fixed_amount: number | null;
  delivery_fee_percentage: number | null;
  platform_tip_percentage: number | null;
  drivers: PaymentGroupDriver[];
}

export interface PaymentGroupPayload {
  name: string;
  rule_type: PaymentRuleType;
  fixed_amount: number | null;
  delivery_fee_percentage: number | null;
  platform_tip_percentage: number | null;
  driver_ids: string[];
  confirm_reassignments: boolean;
}

export interface PayrollDriver {
  id: string;
  name: string;
}

export interface DriverPayrollRates {
  base_salary: number;
  commission_per_delivery: number;
}

export interface DriverPayrollCity extends DriverPayrollRates {
  city_id: string;
  city_name: string;
}

export interface DriverPayrollState extends DriverPayrollRates {
  state_id: string;
  state_name: string;
  cities: DriverPayrollCity[];
}
