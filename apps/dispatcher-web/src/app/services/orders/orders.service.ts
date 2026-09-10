import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DeliveryRouteQuote } from '../../models/new-order-form/new-order-form.model';

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

  quoteDelivery(data: {
    pickup_place_id: string;
    delivery_place_id: string;
    delivery_category_id: string;
    vendor_id?: string | null;
    delivery_date?: string | null;
    delivery_time?: string | null;
    surcharge_ids?: string[];
    pickup_address?: string;
    delivery_address?: string;
  }): Observable<DeliveryRouteQuote> {
    return this.http.post<DeliveryRouteQuote>(`${this.baseUrl}/quote`, data);
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

  uploadDeliveryPhoto(orderId: string, photo: Blob, note = ''): Observable<any> {
    const formData = new FormData();
    formData.append('file', photo, 'photo.jpg');
    formData.append('note', note);
    return this.http.post(`${this.baseUrl}/${orderId}/proof-of-delivery/photo`, formData);
  }

  uploadDeliverySignature(orderId: string, signature: Blob, recipientName: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', signature, 'signature.png');
    formData.append('recipient_name', recipientName);
    return this.http.post(`${this.baseUrl}/${orderId}/proof-of-delivery/signature`, formData);
  }

  /**
   * Records a QR-verified pickup. The API re-checks the code against the order
   * number, so a mismatch that slipped past the scanner still fails here.
   */
  verifyPickupByQr(orderId: string, code: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${orderId}/pickup-verification/qr`, { code });
  }

  /** Records a photo-verified pickup, for senders with no printed label. */
  verifyPickupByPhoto(orderId: string, photo: Blob, note = ''): Observable<any> {
    const formData = new FormData();
    formData.append('file', photo, 'parcel.jpg');
    formData.append('note', note);
    return this.http.post(`${this.baseUrl}/${orderId}/pickup-verification/photo`, formData);
  }

  /** Downloads the parcel photo taken when a pickup was verified without a label. */
  getPickupVerificationPhoto(orderId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${orderId}/pickup-verification/photo`, { responseType: 'blob' });
  }

  /** Downloads a captured proof-of-delivery image (driver signature or delivery photo). */
  getProofOfDeliveryImage(orderId: string, kind: 'photo' | 'signature'): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${orderId}/proof-of-delivery/${kind}`, { responseType: 'blob' });
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

  /** Email the recipient with full order details and a tracking link. */
  sendRecipientNotification(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/notify/recipient`, {});
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
