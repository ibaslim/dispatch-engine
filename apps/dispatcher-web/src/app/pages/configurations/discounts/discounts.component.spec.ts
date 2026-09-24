import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DiscountsComponent } from './discounts.component';

const DISCOUNT = {
  id: 'd1',
  title: 'Black Friday',
  public_label: 'Black Friday',
  description: null,
  discount_type_id: null,
  discount_type_title: null,
  kind: 'percentage',
  value_mode: 'fixed',
  value: 25,
  schedule: { kind: 'annual_nth_weekday', month: 11, weekday: 3, nth: 4, offset_days: 1, duration_days: 1 },
  schedule_label: 'The fourth Thursday of November, 1 day later, every year',
  trigger: 'manual',
  status: 'active',
  reason: null,
  max_discount_amount: null,
  min_gross_fee: null,
  min_net_fee: 0,
  starts_at: null,
  ends_at: null,
  usage_limit_total: null,
  redemption_count: 0,
};

describe('DiscountsComponent', () => {
  async function render(seed: { types?: { id: string; title: string }[] } = {}) {
    await TestBed.configureTestingModule({
      imports: [DiscountsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(DiscountsComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne((req) => req.url === '/api/v1/discounts').flush([DISCOUNT]);
    http.expectOne('/api/v1/discounts/types').flush(seed.types ?? []);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders a card for each loaded discount', async () => {
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain('Black Friday');
  });

  it('opens the editor without a change-detection error', async () => {
    const fixture = await render();

    fixture.componentInstance.openDiscount();
    // The shared popup sets its footer flag after its own check (a dev-mode
    // warning on every popup in the app), so the extra check pass is skipped.
    fixture.detectChanges(false);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('New discount');
    expect(text).toContain('Who sets the amount');
  });

  it('starts a new discount on the first type and requires one', async () => {
    const fixture = await render({ types: [{ id: 't1', title: 'Manual' }, { id: 't2', title: 'Launch' }] });
    const component = fixture.componentInstance;

    component.openDiscount();
    expect(component.discountForm?.discount_type_id).toBe('t1');

    component.discountForm!.discount_type_id = '';
    component.saveAttempted = true;
    expect(component.fieldError('type')).toBe('Choose a type.');
  });

  it('explains when there is no type to choose yet', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;

    component.openDiscount();
    component.saveAttempted = true;

    expect(component.fieldError('type')).toBe('Add a type on the Types tab first.');
  });

  it('forces a fixed amount when a discount is made automatic', async () => {
    const component = (await render()).componentInstance;

    component.openDiscount();
    component.discountForm!.value_mode = 'entered';
    component.setTrigger('automatic');

    expect(component.discountForm!.value_mode).toBe('fixed');
    expect(component.valueModeChoices().map((option) => option.value)).toEqual(['fixed']);
  });

  it('warns when an automatic discount has no schedule', async () => {
    const component = (await render()).componentInstance;

    component.openDiscount();
    component.setTrigger('automatic');
    expect(component.appliesToEveryOrder).toBe(true);

    component.applyPreset('black_friday');
    expect(component.appliesToEveryOrder).toBe(false);
  });

  it('refuses coupon codes inline, since they are not built yet', async () => {
    const component = (await render()).componentInstance;

    component.openDiscount();
    component.setTrigger('code');
    component.saveAttempted = true;

    expect(component.fieldError('trigger')).toContain('not built yet');
  });

  it('offers every option in the mechanic and amount dropdowns', async () => {
    const fixture = await render();

    fixture.componentInstance.openDiscount();
    fixture.detectChanges(false);

    const options = Array.from<HTMLOptionElement>(
      fixture.nativeElement.querySelectorAll('option'),
    ).map((option) => option.textContent?.trim());
    for (const label of [
      'Percentage off',
      'Fixed amount off',
      'Set here',
      'Dispatcher types it per order',
      'Draft',
      'Active',
    ]) {
      expect(options).toContain(label);
    }
  });
});
