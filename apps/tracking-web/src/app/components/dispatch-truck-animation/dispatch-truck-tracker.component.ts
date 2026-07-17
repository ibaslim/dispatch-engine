import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DispatchStage {
  key: string;
  label: string;
  name: string;
  sub: string;
}

@Component({
  selector: 'app-dispatch-truck-tracker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dispatch-truck-tracker.component.html',
  styleUrl: './dispatch-truck-tracker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DispatchTruckTrackerComponent implements OnChanges {
  /** Ordered list of stages the shipment moves through. */
  @Input() stages: DispatchStage[] = [];
  /** Either a stage `key` or a numeric index into `stages`. */
  @Input() currentStage: string | number = 0;

  @Input() orderId = '';
  @Input() driverName = '';
  @Input() vehicleId = '';

  /** Emitted when the user clicks "Track realtime". */
  @Output() trackRealtime = new EventEmitter<void>();

  readonly roadY = 158;
  private readonly svgW = 1200;
  private readonly padX = 90;

  currentIndex = 0;

  private initialized = false;

  ngOnChanges(_changes: SimpleChanges): void {
    const idx = this.resolveIndex();
    if (!this.initialized) {
      this.currentIndex = idx;
      this.initialized = true;
      return;
    }
    if (idx !== this.currentIndex) {
      this.currentIndex = idx;
    }
  }

  /** The van keeps driving (wheels spin, road streams, exhaust puffs) until the order is delivered. */
  get driving(): boolean {
    return this.n > 0 && this.currentIndex < this.n - 1;
  }

  private resolveIndex(): number {
    if (!this.stages?.length) return 0;
    if (typeof this.currentStage === 'number') {
      return Math.max(0, Math.min(this.stages.length - 1, this.currentStage));
    }
    const idx = this.stages.findIndex(s => s.key === this.currentStage);
    return idx >= 0 ? idx : 0;
  }

  get n(): number {
    return this.stages.length;
  }

  get stationX(): number[] {
    const n = this.n;
    if (n <= 1) return [this.padX];
    return this.stages.map((_, i) => this.padX + i * ((this.svgW - this.padX * 2) / (n - 1)));
  }

  get pathD(): string {
    const xs = this.stationX;
    return 'M' + xs.map(x => `${x},${this.roadY}`).join(' L ');
  }

  get truckX(): number {
    const xs = this.stationX;
    const i = this.currentIndex;
    const n = this.n;
    if (n === 0) return 0;
    if (i === n - 1) return xs[i] - 130; // delivered: van sits in front of the final stop
    return (xs[i] + xs[i + 1]) / 2 - 130; // between the current stage and the incoming stage
  }

  get truckTransform(): string {
    return `translate(${this.truckX}px, -26px)`;
  }

  get roadFillDasharray(): number {
    const xs = this.stationX;
    return xs.length ? xs[xs.length - 1] - xs[0] : 0;
  }

  get roadFillDashoffset(): number {
    const xs = this.stationX;
    if (!xs.length) return 0;
    const totalDist = xs[xs.length - 1] - xs[0];
    const doneDist = xs[this.currentIndex] - xs[0];
    return totalDist - doneDist;
  }

  isDone(i: number): boolean {
    return i < this.currentIndex;
  }

  isActive(i: number): boolean {
    return i === this.currentIndex;
  }

  get currentStageData(): DispatchStage | undefined {
    return this.stages[this.currentIndex];
  }

  get isDelivered(): boolean {
    return this.currentStageData?.key === 'DELIVERED';
  }
}
