import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { TenantDriverEntity } from '../../models/drivers/tenant-driver.model';

@Injectable({ providedIn: 'root' })
export class DriversService {
  private readonly baseUrl = '/api/v1/drivers';

  constructor(private readonly http: HttpClient) { }

  getAvailableDrivers(): Observable<TenantDriverEntity[]> {
    return this.http.get<TenantDriverEntity[]>(`${this.baseUrl}/available`);
  }
}

