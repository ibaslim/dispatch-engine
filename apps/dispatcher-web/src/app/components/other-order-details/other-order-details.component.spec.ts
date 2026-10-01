import { TestBed } from '@angular/core/testing';

import type { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import type { Discount } from '@services/discounts/discounts.service';
import { createDefaultNewOrder } from '@pages/orders/orders-mapping.util';
import { OtherOrderDetailsComponent } from './other-order-details.component';

type Details = NewOrderFormValue['details'];

function setup(changes: Partial<Details> = {}) {
  TestBed.configureTestingModule({});
  TestBed.overrideComponent(OtherOrderDetailsComponent, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(OtherOrderDetailsComponent);
  const component = fixture.componentInstance;
  component.value = { ...createDefaultNewOrder().details, ...changes };
  const emitted: Details[] = [];
  component.valueChange.subscribe((details: Details) => {
    emitted.push(details);
    component.value = details;
  });
  return { component, emitted };
}

function percentOff(value: number): Discount {
  return {
    id: 'p1', title: 'off', public_label: 'off', kind: 'percentage', value_mode: 'fixed', value,
    max_discount_amount: null, min_gross_fee: null, min_net_fee: 0,
  } as unknown as Discount;
}

describe('OtherOrderDetailsComponent totals', () => {
  it('adds up price times quantity and skips an item missing either', () => {
    const { component, emitted } = setup();
    component.patch({
      items: [
        { itemName: 'Box', itemPrice: '12.5', itemQty: '3' },
        { itemName: 'Gift', itemPrice: '', itemQty: '2' },
        { itemName: 'Card', itemPrice: '4', itemQty: '' },
      ],
    });
    expect(emitted[0].subtotal).toBe(37.5);
  });

  it('rounds GST and PST on their own, to cents', () => {
    const { component, emitted } = setup({ items: [{ itemName: 'Box', itemPrice: '33.33', itemQty: '1' }] });
    component.patch({ gstRate: 5, pstRate: 8 });
    expect([emitted[0].gstAmount, emitted[0].pstAmount]).toEqual([1.67, 2.67]);
  });

  it('rounds a half cent of tax to the even cent, as the server saves it', () => {
    const { component, emitted } = setup({ items: [{ itemName: 'Box', itemPrice: '10.10', itemQty: '1' }] });
    component.patch({ gstRate: 5, pstRate: 0 });
    expect(emitted[0].gstAmount).toBe(0.5);
  });

  it('totals subtotal, both taxes, fee and tip', () => {
    const { component, emitted } = setup({ items: [{ itemName: 'Box', itemPrice: '100', itemQty: '1' }] });
    component.patch({ gstRate: 5, pstRate: 8, deliveryFees: 400, deliveryTips: 10 });
    expect(emitted[0].total).toBe(523);
  });

  it('takes a picked percentage discount off the delivery fee only', () => {
    const { component, emitted } = setup({ items: [{ itemName: 'Box', itemPrice: '100', itemQty: '1' }] });
    component.availableDiscounts = [percentOff(10)];
    component.patch({ deliveryFees: 400, discountSelections: [{ discountId: 'p1', value: '' }] });
    expect(emitted[0].discount).toBe(40);
    expect(emitted[0].total).toBe(460);
  });

  it('treats unparsable numbers as zero', () => {
    const { component, emitted } = setup();
    component.patch({ deliveryFees: 'abc' as unknown as number, deliveryTips: undefined as unknown as number });
    expect([emitted[0].deliveryFees, emitted[0].deliveryTips, emitted[0].total]).toEqual([0, 0, 0]);
  });
});
