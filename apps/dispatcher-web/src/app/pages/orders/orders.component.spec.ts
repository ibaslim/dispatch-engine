import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { PusherService } from '@core/realtime/pusher.service';
import { ToastService } from '@core/toast/toast.service';
import { OrderDocumentService } from '@services/orders/order-document.service';
import { OrdersService } from '@services/orders/orders.service';
import { ScheduledOrderPromotionService } from '@services/orders/scheduled-order-promotion.service';
import type { DeliveryRouteQuote } from '../../models/new-order-form/new-order-form.model';
import { OrdersComponent } from './orders.component';
import { buildDemoDraftValue } from './orders-mapping.util';

const FEE_CHANGED = {
  status: 409,
  error: {
    detail: {
      code: 'delivery_fee_changed',
      message: 'The delivery fee changed from 400.00 to 700.00. Review it and save again.',
      delivery_fee: 700,
    },
  },
};

function quote(overrides: Partial<DeliveryRouteQuote> = {}): DeliveryRouteQuote {
  return {
    eligible: true, pickup_city: 'Toronto', pickup_zone_id: 'z1', pickup_zone_name: 'GTA',
    delivery_city: 'Toronto', delivery_zone_id: 'z1', delivery_zone_name: 'GTA',
    distance_meters: 12000, distance_km: 12, duration_seconds: 600, radius_km: 30,
    extra_distance_km: 0, base_price: 400, additional_per_km: 5, distance_charge: 0,
    applied_charges: [], delivery_fee: 400, gst_rate: 5, pst_rate: 8, quote_id: 'q1',
    ...overrides,
  };
}

function setup() {
  const orders = {
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    publishOrder: jest.fn(),
    getOrders: jest.fn(() => of([])),
  };
  const toast = { show: jest.fn(), warning: jest.fn(), error: jest.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: OrdersService, useValue: orders },
      { provide: OrderDocumentService, useValue: {} },
      { provide: ScheduledOrderPromotionService, useValue: {} },
      { provide: AuthService, useValue: { isPlatformAdmin: () => true, isDriver: () => false } },
      { provide: ToastService, useValue: toast },
      { provide: PusherService, useValue: { orderEvents$: EMPTY } },
      { provide: Router, useValue: {} },
    ],
  });
  TestBed.overrideComponent(OrdersComponent, { set: { template: '', imports: [] } });
  const component = TestBed.createComponent(OrdersComponent).componentInstance;

  // A form that passes the page's checks, with a fresh quote the way the form leaves it.
  const value = buildDemoDraftValue();
  const place = (id: string) => ({ placeId: id, formattedAddress: id, latitude: 43.7, longitude: -79.4 });
  value.pickup.location = place('P1');
  value.delivery.location = place('P2');
  value.deliveryCategoryId = 'cat-1';
  value.routeQuote = quote();
  component.newOrderValue = value;
  component.isNewOrderOpen = true;
  return { component, orders, toast };
}

describe('OrdersComponent saving an order', () => {
  it('sends the quote id and the fee the form showed, then closes the form', async () => {
    const { component, orders } = setup();
    orders.createOrder.mockReturnValue(of({ id: 'o1' }));
    await component.saveNewOrder();

    expect(orders.createOrder).toHaveBeenCalledTimes(1);
    expect(orders.createOrder.mock.calls[0][0]).toMatchObject({ quote_id: 'q1', quoted_delivery_fee: 400 });
    expect(component.isNewOrderOpen).toBe(false);
    expect(component.feedbackTone).toBe('success');
  });

  it('edits an existing order instead of creating one', async () => {
    const { component, orders } = setup();
    component.editingOrderId = 'o9';
    orders.updateOrder.mockReturnValue(of({ id: 'o9' }));
    await component.saveNewOrder();

    expect(orders.updateOrder).toHaveBeenCalledWith('o9', expect.objectContaining({ quote_id: 'q1' }));
    expect(orders.createOrder).not.toHaveBeenCalled();
  });

  it('keeps the form open, shows the new fee message and asks the form to requote when the fee moved', async () => {
    const { component, orders, toast } = setup();
    orders.createOrder.mockReturnValue(throwError(() => FEE_CHANGED));
    await component.saveNewOrder();

    expect(component.requoteTick).toBe(1);
    expect(component.isNewOrderOpen).toBe(true);
    expect(component.isSavingOrder).toBe(false);
    expect(component.feedbackMessage).toBe(FEE_CHANGED.error.detail.message);
    expect(component.feedbackTone).toBe('error');
    expect(toast.show).toHaveBeenCalledWith('error', FEE_CHANGED.error.detail.message);
    expect(orders.getOrders).not.toHaveBeenCalled();
  });

  it('does the same when an edit meets a moved fee', async () => {
    const { component, orders } = setup();
    component.editingOrderId = 'o9';
    orders.updateOrder.mockReturnValue(throwError(() => FEE_CHANGED));
    await component.saveNewOrder();

    expect(component.requoteTick).toBe(1);
    expect(component.isNewOrderOpen).toBe(true);
    expect(component.editingOrderId).toBe('o9');
  });

  it('shows any other server message as it is, without requoting', async () => {
    const { component, orders } = setup();
    orders.createOrder.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'This discount has reached its limit.' } })),
    );
    await component.saveNewOrder();

    expect(component.requoteTick).toBe(0);
    expect(component.feedbackMessage).toBe('This discount has reached its limit.');
  });

  it('shows a generic message when the server gives none', async () => {
    const { component, orders } = setup();
    orders.createOrder.mockReturnValue(throwError(() => ({ status: 500, error: '' })));
    await component.saveNewOrder();

    expect(component.feedbackMessage).toBe('Failed to save order.');
  });

  it('does not save a form that has no quote', async () => {
    const { component, orders } = setup();
    component.newOrderValue.routeQuote = null;
    await component.saveNewOrder();

    expect(orders.createOrder).not.toHaveBeenCalled();
  });
});

describe('OrdersComponent publishing an order', () => {
  it('saves, then publishes the saved order', async () => {
    const { component, orders } = setup();
    orders.createOrder.mockReturnValue(of({ id: 'o1' }));
    orders.publishOrder.mockReturnValue(of({}));
    await component.publishNewOrder();

    expect(orders.createOrder.mock.calls[0][0]).toMatchObject({ quote_id: 'q1', quoted_delivery_fee: 400 });
    expect(orders.publishOrder).toHaveBeenCalledWith('o1');
    expect(component.isNewOrderOpen).toBe(false);
  });

  it('publishes an edited order under its own id', async () => {
    const { component, orders } = setup();
    component.editingOrderId = 'o9';
    orders.updateOrder.mockReturnValue(of({ id: 'o9' }));
    orders.publishOrder.mockReturnValue(of({}));
    await component.publishNewOrder();

    expect(orders.publishOrder).toHaveBeenCalledWith('o9');
  });

  it('publishes nothing and asks the form to requote when the fee moved', async () => {
    const { component, orders } = setup();
    orders.createOrder.mockReturnValue(throwError(() => FEE_CHANGED));
    await component.publishNewOrder();

    expect(orders.publishOrder).not.toHaveBeenCalled();
    expect(component.requoteTick).toBe(1);
    expect(component.isNewOrderOpen).toBe(true);
    expect(component.isPublishingOrder).toBe(false);
    expect(component.feedbackMessage).toBe(FEE_CHANGED.error.detail.message);
  });

  it('shows a generic message when publishing fails without one', async () => {
    const { component, orders } = setup();
    orders.createOrder.mockReturnValue(of({ id: 'o1' }));
    orders.publishOrder.mockReturnValue(throwError(() => ({ status: 500, error: null })));
    await component.publishNewOrder();

    expect(component.feedbackMessage).toBe('Failed to publish order.');
    expect(component.requoteTick).toBe(0);
  });
});
