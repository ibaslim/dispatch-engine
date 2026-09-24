import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { BaseInputComponent } from '@components/base-input/base-input.component';
import { DropdownSelectorComponent } from '@components/dropdown-selector/dropdown-selector.component';
import { ErrorMessageComponent } from '@components/error-message/error-message.component';
import { TextareaComponent } from '@components/textarea/textarea.component';
import { SelectOption } from '@models/dropdown-selector/dropdown-selector.model';
import { DiscountSchedule, ScheduleKind } from '@services/discounts/discounts.service';

/** The strings-while-typing shape of a schedule; converted to/from `DiscountSchedule` at the edges. */
interface ScheduleForm {
  schedule_kind: ScheduleKind;
  /** Monday is 0, matching the API. */
  days: number[];
  month: string;
  day: string;
  weekday: string;
  nth: string;
  offset_days: string;
  duration_days: string;
  dates: string;
  time_start: string;
  time_end: string;
}

/**
 * "When it applies", as its own form: presets, weekday picker, annual/moving-date
 * fields, chosen dates, and an optional time window. Used by both the discount
 * editor and the coupon editor so the recurrence rules live in exactly one place.
 */
@Component({
  selector: 'app-schedule-editor',
  standalone: true,
  imports: [
    CommonModule,
    BaseInputComponent,
    DropdownSelectorComponent,
    ErrorMessageComponent,
    TextareaComponent,
  ],
  templateUrl: './schedule-editor.component.html',
})
export class ScheduleEditorComponent {
  /** Set once, when the host opens its form; the component owns changes after that. */
  @Input()
  set schedule(value: DiscountSchedule) {
    this.form = this.scheduleToForm(value);
    this.touched = {};
  }

  /** Mirrors the host's own "Save was pressed" flag, so errors reveal together. */
  @Input() saveAttempted = false;

  @Output() scheduleChange = new EventEmitter<DiscountSchedule>();

  form: ScheduleForm = this.scheduleToForm({ kind: 'always' });
  touched: Record<string, boolean> = {};

  /** Named occasions first, so nobody has to know what "nth weekday" means. */
  readonly schedulePresets: { id: string; label: string }[] = [
    { id: 'always', label: 'Any day' },
    { id: 'weekly', label: 'Certain weekdays' },
    { id: 'christmas', label: 'Christmas Day' },
    { id: 'boxing_week', label: 'Boxing week' },
    { id: 'black_friday', label: 'Black Friday' },
    { id: 'new_year', label: 'New Year\'s Day' },
    { id: 'annual', label: 'Another yearly date' },
    { id: 'annual_nth_weekday', label: 'Another moving date' },
    { id: 'date_list', label: 'Chosen dates' },
  ];
  readonly weekdays = [
    { value: 0, label: 'Mon' },
    { value: 1, label: 'Tue' },
    { value: 2, label: 'Wed' },
    { value: 3, label: 'Thu' },
    { value: 4, label: 'Fri' },
    { value: 5, label: 'Sat' },
    { value: 6, label: 'Sun' },
  ];
  readonly nthOptions: SelectOption<string>[] = [
    { value: '1', label: 'first' },
    { value: '2', label: 'second' },
    { value: '3', label: 'third' },
    { value: '4', label: 'fourth' },
    { value: '5', label: 'fifth' },
    { value: '-1', label: 'last' },
  ];
  readonly weekdayOptions: SelectOption<string>[] = this.weekdays.map((day) => ({
    value: String(day.value),
    label: day.label,
  }));

  markTouched(field: string): void {
    this.touched[field] = true;
  }

  fieldError(field: string): string | null {
    if (!this.touched[field] && !this.saveAttempted) return null;
    return this.errors()[field] ?? null;
  }

  hasError(field: string): boolean {
    return !!this.fieldError(field);
  }

  /** For the host's own save-gating; independent of whether errors are shown yet. */
  hasErrors(): boolean {
    return Object.keys(this.errors()).length > 0;
  }

  private errors(): Record<string, string> {
    const form = this.form;
    const errors: Record<string, string> = {};
    if (form.schedule_kind === 'weekly' && !form.days.length) {
      errors['days'] = 'Pick at least one day.';
    }
    if (form.schedule_kind === 'annual') {
      const month = Number(form.month);
      const day = Number(form.day);
      if (!month || month < 1 || month > 12) errors['month'] = 'Month is 1 to 12.';
      if (!day || day < 1 || day > 31) errors['day'] = 'Day is 1 to 31.';
    }
    if (form.schedule_kind === 'annual_nth_weekday') {
      const month = Number(form.month);
      if (!month || month < 1 || month > 12) errors['month'] = 'Month is 1 to 12.';
    }
    if (form.schedule_kind === 'date_list' && !this.parsedDates().length) {
      errors['dates'] = 'Add a date as YYYY-MM-DD.';
    }
    if ((form.time_start && !form.time_end) || (form.time_end && !form.time_start)) {
      errors['time_end'] = 'Set both times, or neither.';
    }
    return errors;
  }

  update(patch: Partial<ScheduleForm>): void {
    this.form = { ...this.form, ...patch };
    this.emit();
  }

  toggleDay(day: number): void {
    const days = [...this.form.days];
    const index = days.indexOf(day);
    if (index >= 0) days.splice(index, 1);
    else days.push(day);
    this.update({ days: days.sort((a, b) => a - b) });
  }

  hasDay(day: number): boolean {
    return this.form.days.includes(day);
  }

  applyPreset(id: string): void {
    this.touched['days'] = false;
    this.touched['month'] = false;
    this.touched['day'] = false;
    this.touched['dates'] = false;

    switch (id) {
      case 'weekly':
        return this.update({ schedule_kind: 'weekly' });
      case 'christmas':
        return this.update({ schedule_kind: 'annual', month: '12', day: '25', duration_days: '1' });
      case 'boxing_week':
        return this.update({ schedule_kind: 'annual', month: '12', day: '26', duration_days: '7' });
      case 'new_year':
        return this.update({ schedule_kind: 'annual', month: '1', day: '1', duration_days: '1' });
      case 'black_friday':
        return this.update({
          schedule_kind: 'annual_nth_weekday',
          month: '11',
          weekday: '3',
          nth: '4',
          offset_days: '1',
          duration_days: '1',
        });
      case 'annual':
        return this.update({ schedule_kind: 'annual', month: '', day: '', duration_days: '1' });
      case 'annual_nth_weekday':
        return this.update({
          schedule_kind: 'annual_nth_weekday',
          month: '',
          weekday: '0',
          nth: '1',
          offset_days: '0',
          duration_days: '1',
        });
      case 'date_list':
        return this.update({ schedule_kind: 'date_list' });
      default:
        return this.update({ schedule_kind: 'always' });
    }
  }

  /** Which preset chip is lit, worked out from the values themselves. */
  activePreset(): string {
    const form = this.form;
    const month = Number(form.month);
    const day = Number(form.day);
    const duration = Number(form.duration_days);
    if (form.schedule_kind === 'annual' && month === 12 && day === 25 && duration === 1) {
      return 'christmas';
    }
    if (form.schedule_kind === 'annual' && month === 12 && day === 26 && duration === 7) {
      return 'boxing_week';
    }
    if (form.schedule_kind === 'annual' && month === 1 && day === 1 && duration === 1) {
      return 'new_year';
    }
    if (
      form.schedule_kind === 'annual_nth_weekday' &&
      month === 11 &&
      Number(form.weekday) === 3 &&
      Number(form.nth) === 4 &&
      Number(form.offset_days) === 1
    ) {
      return 'black_friday';
    }
    return form.schedule_kind;
  }

  /** Only a hand-built recurrence needs its parts shown. */
  showScheduleFields(): boolean {
    const preset = this.activePreset();
    return preset === 'weekly'
      || preset === 'annual'
      || preset === 'annual_nth_weekday'
      || preset === 'date_list';
  }

  /** What the current settings mean, in a sentence. Mirrors the server's label. */
  schedulePreview(): string {
    const form = this.form;
    const window = form.time_start && form.time_end
      ? `, ${form.time_start}-${form.time_end}`
      : '';

    if (form.schedule_kind === 'weekly') {
      if (!form.days.length) return 'Pick the days it runs on.';
      const names = this.weekdays
        .filter((day) => form.days.includes(day.value))
        .map((day) => day.label)
        .join(', ');
      return `Every ${names}${window}`;
    }
    if (form.schedule_kind === 'annual') {
      const month = Number(form.month);
      const day = Number(form.day);
      if (!month || !day) return 'Pick the month and day.';
      const label = new Date(2000, month - 1, day).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
      });
      const days = Number(form.duration_days) || 1;
      return `${label} every year${days > 1 ? `, for ${days} days` : ''}${window}`;
    }
    if (form.schedule_kind === 'annual_nth_weekday') {
      const month = Number(form.month);
      if (!month) return 'Pick the month.';
      const monthName = new Date(2000, month - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
      const nth = this.nthOptions.find((item) => item.value === String(form.nth))?.label ?? 'first';
      const weekday = this.weekdays.find((item) => String(item.value) === String(form.weekday));
      const offset = Number(form.offset_days) || 0;
      const shift = offset
        ? `, ${Math.abs(offset)} day${Math.abs(offset) > 1 ? 's' : ''} ${offset > 0 ? 'later' : 'earlier'}`
        : '';
      const days = Number(form.duration_days) || 1;
      const span = days > 1 ? `, for ${days} days` : '';
      return `The ${nth} ${weekday?.label ?? 'Mon'} of ${monthName}${shift}${span}, every year${window}`;
    }
    if (form.schedule_kind === 'date_list') {
      const dates = this.parsedDates();
      if (!dates.length) return 'Add the dates it runs on.';
      return `On ${dates.slice(0, 3).join(', ')}${dates.length > 3 ? ` +${dates.length - 3} more` : ''}${window}`;
    }
    return 'Any day of the year';
  }

  /** An automatic discount with no schedule would take something off every order;
   * only the discount editor cares, but the check belongs next to the schedule. */
  get appliesEveryDay(): boolean {
    return this.activePreset() === 'always';
  }

  private parsedDates(): string[] {
    return this.form.dates
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  private emit(): void {
    this.scheduleChange.emit(this.buildSchedule());
  }

  private buildSchedule(): DiscountSchedule {
    const form = this.form;
    const window: Partial<DiscountSchedule> =
      form.time_start && form.time_end
        ? { time_start: form.time_start, time_end: form.time_end }
        : {};
    switch (form.schedule_kind) {
      case 'weekly':
        return { kind: 'weekly', days: form.days, ...window };
      case 'annual':
        return {
          kind: 'annual',
          month: Number(form.month),
          day: Number(form.day),
          duration_days: Number(form.duration_days) || 1,
          ...window,
        };
      case 'annual_nth_weekday':
        return {
          kind: 'annual_nth_weekday',
          month: Number(form.month),
          weekday: Number(form.weekday),
          nth: Number(form.nth),
          offset_days: Number(form.offset_days) || 0,
          duration_days: Number(form.duration_days) || 1,
          ...window,
        };
      case 'date_list':
        return { kind: 'date_list', dates: this.parsedDates(), ...window };
      default:
        return { kind: 'always' };
    }
  }

  private scheduleToForm(schedule: DiscountSchedule): ScheduleForm {
    return {
      schedule_kind: schedule?.kind || 'always',
      days: schedule?.days ? [...schedule.days] : [],
      month: schedule?.month ? String(schedule.month) : '',
      day: schedule?.day ? String(schedule.day) : '',
      weekday: schedule?.weekday !== undefined ? String(schedule.weekday) : '0',
      nth: schedule?.nth !== undefined ? String(schedule.nth) : '1',
      offset_days: schedule?.offset_days ? String(schedule.offset_days) : '0',
      duration_days: schedule?.duration_days ? String(schedule.duration_days) : '1',
      dates: (schedule?.dates || []).join(', '),
      time_start: (schedule?.time_start || '').slice(0, 5),
      time_end: (schedule?.time_end || '').slice(0, 5),
    };
  }
}
