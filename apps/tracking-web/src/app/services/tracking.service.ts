import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OrderTrackingDetails } from '@models/order-tracking.model';

export interface DriverLocation {
  driver_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly http = inject(HttpClient);

  /**
   * Fetch public order details for the tracking page.
   * Accepts either a tracking link token (order UUID) or an order number.
   */
  getOrderDetails(token: string): Observable<OrderTrackingDetails> {
    return this.http.get<OrderTrackingDetails>(
      `/api/v1/tracking/${encodeURIComponent(token)}/order`
    );
  }

  /**
   * Fetch the driver's last known coordinates from Redis.
   * Returns 404 if the driver is offline or location has expired.
   */
  getDriverLocation(driverId: string): Observable<DriverLocation> {
    return this.http.get<DriverLocation>(
      `/api/v1/drivers/${encodeURIComponent(driverId)}/location`
    );
  }
}