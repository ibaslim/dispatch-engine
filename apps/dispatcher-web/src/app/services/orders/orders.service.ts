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

  updateActivityStatus(id: string, activityStatus: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/activity-status`, { activity_status: activityStatus });
  }

  uploadDeliveryPhoto(orderId: string, photo: Blob): Observable<any> {
    const formData = new FormData();
    formData.append('file', photo, 'photo.jpg');
    return this.http.post(`${this.baseUrl}/${orderId}/proof-of-delivery/photo`, formData);
  }

  uploadDeliverySignature(orderId: string, signature: Blob, recipientName: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', signature, 'signature.png');
    formData.append('recipient_name', recipientName);
    return this.http.post(`${this.baseUrl}/${orderId}/proof-of-delivery/signature`, formData);
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

  /** Email the order invoice slip to the pickup/sender contact. */
  sendSenderInvoice(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/notify/sender`, {});
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

  /** Driver reports an exception at pickup/delivery (e.g. sender/recipient absent). */
  reportIncident(id: string, stage: 'pickup' | 'delivery', reason: string, description: string | null): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/report`, { stage, reason, description });
  }
}

