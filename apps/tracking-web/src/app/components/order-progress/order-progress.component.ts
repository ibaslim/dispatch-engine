
import { Component, computed, input } from '@angular/core';

/**
 * Delivery journey timeline for the public tracking page.
 *
 * Renders the parcel's route as five stacked stops connected by a "road":
 * completed segments are asphalt with a dashed yellow center line
 * (the Central Courier signature), the current stop carries the van.
 * Each stop shows its label and, once reached, the local time it was
 * reached at.
 *
 * Stages are derived from the order's activity_status:
 *   driver_not_assigned                → Dispatched
 *   pickup_initiated                   → Picked up (van en route to pickup)
 *   picked_up / delivery_initiated     → In transit
 *   delivery_in_progress               → Out for delivery
 *   delivered                          → Delivered
 */

type StageState = 'done' | 'current' | 'todo';

interface Stage {
  label: string;
  state: StageState;
  time: string | null;
}

const STAGE_LABELS = [
  'Dispatched',
  'Picked up',
  'In transit',
  'Out for delivery',
  'Delivered',
] as const;

const ACTIVITY_TO_STAGE: Record<string, number> = {
  driver_not_assigned: 0,
  pickup_initiated: 1,
  picked_up: 2,
  delivery_initiated: 2,
  delivery_in_progress: 3,
  delivered: 4,
};

// Timestamp field(s) that can supply each stage's "reached at" time, keyed by
// stage index. Where two activity statuses map to the same stage (picked_up /
// delivery_initiated both mean "in transit"), the later checkpoint wins.
const STAGE_TIMESTAMP_KEYS: (keyof StageTimestamps)[][] = [
  [],
  ['pickup_initiated_at'],
  ['picked_up_at', 'delivery_initiated_at'],
  ['delivery_in_progress_at'],
  ['delivered_at'],
];

export interface StageTimestamps {
  pickup_initiated_at?: string | null;
  picked_up_at?: string | null;
  delivery_initiated_at?: string | null;
  delivery_in_progress_at?: string | null;
  delivered_at?: string | null;
}

@Component({
  selector: 'app-order-progress',
  standalone: true,
  template: `
    <ol class="flex flex-col" aria-label="Delivery progress">
      @for (stage of stages(); track stage.label; let i = $index) {
        <li
          class="relative flex items-start gap-4"
          [attr.aria-current]="stage.state === 'current' ? 'step' : null"
        >
          @if (i > 0) {
            <div
              class="seg"
              [class.seg-done]="stage.state !== 'todo'"
              [class.seg-todo]="stage.state === 'todo'"
              aria-hidden="true"
            ></div>
          }

          <div class="w-9 flex items-center justify-center shrink-0">
            @switch (stage.state) {
              @case ('done') {
                <div class="node relative z-10 w-7 h-7 rounded-full bg-courier-ink text-courier-yellow flex items-center justify-center">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 13l4 4 10-10" />
                  </svg>
                </div>
              }
              @case ('current') {
                <div class="node node-current relative z-10 w-9 h-9 rounded-full bg-courier-yellow text-courier-ink flex items-center justify-center">
                  <svg class="w-5 h-5" viewBox="0 0 24 18" fill="currentColor" aria-hidden="true">
                    <rect x="0.5" y="2" width="13" height="9.5" rx="1.2" />
                    <path d="M14.5 5h4.2l3.3 3.4V11.5h-7.5z" />
                    <circle cx="5" cy="13.5" r="2.3" />
                    <circle cx="17.5" cy="13.5" r="2.3" />
                  </svg>
                </div>
              }
              @default {
                <div class="node relative z-10 w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                  <div class="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                </div>
              }
            }
          </div>

          <div class="flex-1 flex items-center justify-between gap-3 pb-7 pt-1.5">
            <span
              class="text-xs sm:text-sm font-extrabold uppercase tracking-wide leading-tight"
              [class.text-courier-ink]="stage.state !== 'todo'"
              [class.text-gray-400]="stage.state === 'todo'"
            >
              {{ stage.label }}
            </span>
            @if (stage.time) {
              <span class="text-[10px] sm:text-xs text-gray-400 leading-tight whitespace-nowrap">
                {{ stage.time }}
              </span>
            }
          </div>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      ol {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      li:last-child > div:last-child {
        padding-bottom: 0;
      }

      /* Road segment connecting a stop to the previous one. */
      .seg {
        position: absolute;
        top: -50%;
        left: 1.125rem; /* center of the 2.25rem node column */
        height: 100%;
        z-index: 0;
      }

      /* Traveled road: asphalt with a dashed yellow center line. */
      .seg-done {
        width: 6px;
        margin-left: -3px;
        border-radius: 3px;
        background-color: #2e3e51;
        background-image: repeating-linear-gradient(
          180deg,
          #ffc907 0 7px,
          transparent 7px 14px
        );
        background-size: 2px calc(100% - 12px);
        background-position: center;
        background-repeat: no-repeat;
      }

      /* Road not yet traveled. */
      .seg-todo {
        width: 0;
        margin-left: -1px;
        border-left: 2px dashed #d1d5db;
      }

      .node-current {
        animation: pulse-stop 2.2s ease-out infinite;
      }

      @keyframes pulse-stop {
        0% {
          box-shadow: 0 0 0 0 rgba(255, 201, 7, 0.5);
        }
        70%,
        100% {
          box-shadow: 0 0 0 11px rgba(255, 201, 7, 0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .node-current {
          animation: none;
        }
      }
    `,
  ],
})
export class OrderProgressComponent {
  readonly activityStatus = input.required<string>();
  readonly timestamps = input<StageTimestamps | undefined | null>(undefined);

  private formatStageTime(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  private stageTimeFor(stageIndex: number): string | null {
    const ts = this.timestamps();
    if (!ts) return null;
    const keys = STAGE_TIMESTAMP_KEYS[stageIndex] ?? [];
    for (let i = keys.length - 1; i >= 0; i--) {
      const value = ts[keys[i]];
      if (value) return this.formatStageTime(value);
    }
    return null;
  }

  readonly stages = computed<Stage[]>(() => {
    const status = this.activityStatus();
    const active = ACTIVITY_TO_STAGE[status] ?? 0;
    const delivered = status === 'delivered';

    return STAGE_LABELS.map((label, i) => {
      const state: StageState =
        i < active || (delivered && i === active)
          ? 'done'
          : i === active
            ? 'current'
            : 'todo';

      return {
        label,
        state,
        time: state === 'todo' ? null : this.stageTimeFor(i),
      };
    });
  });
}