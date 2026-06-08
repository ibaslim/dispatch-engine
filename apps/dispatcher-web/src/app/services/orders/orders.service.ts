import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly baseUrl = '/api/v1/orders';

  constructor(private http: HttpClient) { }

  getOrders(): Observable<any> {
    return this.http.get(this.baseUrl);
  }

  createOrder(data: any): Observable<any> {
    return this.http.post(this.baseUrl, data);
  }

  updateStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/status`, { status });
  }

  toggleReady(id: string, ready: boolean): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/ready`, { ready });
  }

  updateOrder(id: string, data: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}`, data);
  }

  assignDriver(orderId: string, driverId: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${orderId}/assign-driver`, {
      driver_id: driverId
    });
  }

  unassignDriver(orderId: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${orderId}`, {
      driver_id: null
    });
  }

  deleteOrder(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  /** Publish a saved order to all online drivers (platform admin only). */
  publishOrder(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/publish`, {});
  }

  /** Driver accepts a published order — assigns themselves. */
  acceptOrder(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/accept`, {});
  }

  /** Get all currently live published orders (within 15-min window, no driver). */
  getPublishedOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/published`);
  }
}
