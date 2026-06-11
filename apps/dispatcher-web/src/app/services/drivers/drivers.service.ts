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
