import { SimpleChange } from '@angular/core';

import { PopupComponent } from './popup.component';

describe('PopupComponent', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('locks and unlocks body scrolling when its open input changes', () => {
    const component = new PopupComponent();

    component.open = true;
    component.ngOnChanges({ open: new SimpleChange(false, true, false) });
    expect(document.body.style.overflow).toBe('hidden');

    component.open = false;
    component.ngOnChanges({ open: new SimpleChange(true, false, false) });
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks body scrolling when destroyed while open', () => {
    const component = new PopupComponent();
    component.open = true;
    document.body.style.overflow = 'hidden';

    component.ngOnDestroy();

    expect(document.body.style.overflow).toBe('');
  });
});
