import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StopScheduleComponent } from './stop-schedule.component';

function render(inputs: Partial<StopScheduleComponent>): ComponentFixture<StopScheduleComponent> {
  const fixture = TestBed.createComponent(StopScheduleComponent);
  Object.assign(fixture.componentInstance, { label: 'Pickup', name: 'pickup', date: '2026-09-15', ...inputs });
  fixture.detectChanges();
  return fixture;
}

function query<T extends Element>(fixture: ComponentFixture<StopScheduleComponent>, selector: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

describe('StopScheduleComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StopScheduleComponent] });
  });

  it('shows "Any time" until a specific time is set, then a time input in the same slot', () => {
    const fixture = render({ timeSpecified: false });
    expect(query(fixture, 'input[type="time"]')).toBeNull();
    expect(query<HTMLButtonElement>(fixture, 'button')?.textContent).toContain('Any time');

    fixture.componentRef.setInput('timeSpecified', true);
    fixture.detectChanges();

    expect(query(fixture, 'input[type="time"]')).not.toBeNull();
    expect(query(fixture, 'button')).toBeNull();
  });

  it('shows the time error as soon as a time is entered', () => {
    const fixture = render({ timeSpecified: true, timeError: 'That time has already passed today.' });
    expect(fixture.nativeElement.textContent).not.toContain('already passed');

    const input = query<HTMLInputElement>(fixture, 'input[type="time"]')!;
    input.value = '10:00';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(query(fixture, '#pickup-time-error')?.textContent).toContain('That time has already passed today.');
  });

  it('shows the time error on submit even if the field was never touched', () => {
    const fixture = render({
      timeSpecified: true,
      timeError: 'Choose a pickup time, or untick "Set a specific time".',
      showSubmitValidation: true,
    });

    expect(query(fixture, '#pickup-time-error')?.textContent).toContain('Choose a pickup time');
  });

  it('never shows a time error while the stop is any time', () => {
    const fixture = render({ timeSpecified: false, timeError: 'That time has already passed today.', showSubmitValidation: true });

    expect(query(fixture, '#pickup-time-error')).toBeNull();
  });

  it('clears the time when the box is unticked', () => {
    const fixture = render({ timeSpecified: true, time: '10:00' });
    const emitted: unknown[] = [];
    fixture.componentInstance.scheduleChange.subscribe((value) => emitted.push(value));

    const checkbox = query<HTMLInputElement>(fixture, 'input[type="checkbox"]')!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([{ date: '2026-09-15', time: '', timeSpecified: false }]);
  });

  it('ticks the box when "Any time" is clicked', () => {
    const fixture = render({ timeSpecified: false });
    const emitted: unknown[] = [];
    fixture.componentInstance.scheduleChange.subscribe((value) => emitted.push(value));

    query<HTMLButtonElement>(fixture, 'button')!.click();

    expect(emitted).toEqual([{ date: '2026-09-15', time: '', timeSpecified: true }]);
  });
});
