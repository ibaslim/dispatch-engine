import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import type { StopSchedule } from '@pages/orders/order-schedule.util';

/** Date plus an optional specific time for one stop (pickup or delivery). */
@Component({
  selector: 'app-stop-schedule',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stop-schedule.component.html',
  styles: [`:host { display: block; }`],
})
export class StopScheduleComponent {
  @Input() label = '';
  @Input() name = '';
  @Input() date = '';
  @Input() time = '';
  @Input() timeSpecified = false;
  @Input() minDate = '';
  @Input() minTime: string | null = null;
  @Input() dateError = '';
  @Input() timeError = '';
  @Input() showSubmitValidation = false;

  @Output() scheduleChange = new EventEmitter<StopSchedule>();

  @ViewChild('timeInput') timeInput?: ElementRef<HTMLInputElement>;

  private dateTouched = false;
  private timeTouched = false;

  get visibleDateError(): string {
    return this.dateTouched || this.showSubmitValidation ? this.dateError : '';
  }

  get visibleTimeError(): string {
    return this.timeSpecified && (this.timeTouched || this.showSubmitValidation) ? this.timeError : '';
  }

  onDate(date: string): void {
    this.dateTouched = true;
    this.emit({ date });
  }

  onTime(time: string): void {
    this.timeTouched = true;
    this.emit({ time });
  }

  onTimeSpecified(timeSpecified: boolean): void {
    // Unticking drops the time so a hidden value can't be saved.
    this.emit(timeSpecified ? { timeSpecified } : { timeSpecified, time: '' });
    if (timeSpecified) {
      setTimeout(() => this.timeInput?.nativeElement.focus());
    } else {
      this.timeTouched = false;
    }
  }

  private emit(change: Partial<StopSchedule>): void {
    this.scheduleChange.emit({
      date: this.date,
      time: this.time,
      timeSpecified: this.timeSpecified,
      ...change,
    });
  }
}
