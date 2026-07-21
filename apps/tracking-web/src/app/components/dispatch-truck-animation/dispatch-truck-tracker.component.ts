import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
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
export class DispatchTruckTrackerComponent implements OnChanges, OnInit, OnDestroy {
  /** Ordered list of stages the shipment moves through. */
  @Input() stages: DispatchStage[] = [];
  /** Either a stage `key` or a numeric index into `stages`. */
  @Input() currentStage: string | number = 0;

  @Input() orderId = '';
  @Input() driverName = '';
  @Input() vehicleId = '';

  /** Emitted when the user clicks "Track realtime". */
  @Output() trackRealtime = new EventEmitter<void>();

  private readonly cdr = inject(ChangeDetectorRef);

  readonly roadY = 158;
  private readonly svgW = 1200;
  private readonly padX = 50;
  /** Breathing room around a cropped mobile pair so a dot/label isn't clipped at the edge. */
  private readonly mobileEdgePad = 50;

  currentIndex = 0;

  private initialized = false;

  // Below Tailwind's `lg` breakpoint (1024px) the SVG crops to just the
  // current + next station, with the current stage pinned to the start of
  // the visible road. Full view only kicks in at lg and above.
  private readonly mobileQuery =
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)') : null;
  isMobile = this.mobileQuery?.matches ?? false;
  private readonly handleMobileChange = (e: MediaQueryListEvent): void => {
    this.isMobile = e.matches;
    this.cdr.markForCheck();
  };

  ngOnInit(): void {
    this.mobileQuery?.addEventListener('change', this.handleMobileChange);
  }

  ngOnDestroy(): void {
    this.mobileQuery?.removeEventListener('change', this.handleMobileChange);
  }

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

  /**
   * Full canvas at `lg` and above. Below that, crops to just the current +
   * next station so the current stage sits at the start of the visible road
   * instead of being lost off to the side of a full-width, mostly-empty strip.
   */
  get viewBox(): string {
    const xs = this.stationX;
    const n = this.n;
    if (!this.isMobile || n <= 2 || xs.length < 2) {
      return `0 0 ${this.svgW} 210`;
    }
    const start = Math.min(this.currentIndex, n - 2);
    const x0 = Math.max(0, xs[start] - this.mobileEdgePad);
    const x1 = Math.min(this.svgW, xs[start + 1] + this.mobileEdgePad);
    return `${x0} 0 ${x1 - x0} 210`;
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
    return `translate(${this.truckX}px, -24px)`;
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

  /**
   * Below `lg` only the current stage and the one after it stay visible, to
   * avoid cramming every stop's label onto a narrow/medium screen. At the
   * final stage (no "current + 1") the previous stage is shown instead, so
   * two stations are always on screen.
   */
  isMobileVisible(i: number): boolean {
    const n = this.n;
    if (n <= 2) return true;
    const start = Math.min(this.currentIndex, n - 2);
    return i === start || i === start + 1;
  }

  get currentStageData(): DispatchStage | undefined {
    return this.stages[this.currentIndex];
  }

  get isDelivered(): boolean {
    return this.currentStageData?.key === 'DELIVERED';
  }
}
