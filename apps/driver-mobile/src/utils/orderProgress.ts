/**
 * The driver's job progression, derived from the API's `ActivityStatus` enum.
 *
 * These five steps are exactly the states the backend can store — the app never
 * invents an intermediate state it can't persist. `driver_not_assigned` is not a
 * step: accepting an order stamps `pickup_initiated` server-side, so an assigned
 * order always enters the timeline at step 0.
 */
import type { ActivityStatus, IncidentStage } from '@types';

export interface ProgressStep {
  status: ActivityStatus;
  /** Timeline row label. */
  label: string;
  /** Shown under the label while this step is the current one. */
  hint: string;
  /** Label for the button that advances *into* this step. */
  action: string;
}

export const PROGRESS_STEPS: readonly ProgressStep[] = [
  {
    status: 'pickup_initiated',
    label: 'Heading to Pickup',
    hint: 'Navigate to the pickup address.',
    action: 'Start Pickup',
  },
  {
    status: 'picked_up',
    label: 'Picked Up',
    hint: 'Parcel collected from the sender.',
    action: "I've Collected the Parcel",
  },
  {
    status: 'delivery_initiated',
    label: 'Heading to Drop',
    hint: 'Navigate to the delivery address.',
    action: 'Start Delivery',
  },
  {
    status: 'delivery_in_progress',
    label: 'Arrived — Proof of Delivery',
    hint: 'Capture proof at the door.',
    action: "I've Arrived at Drop",
  },
  {
    status: 'delivered',
    label: 'Delivered',
    hint: 'Job complete.',
    action: 'Complete Delivery',
  },
];

/** Index of `status` in the timeline, or -1 when the job hasn't started. */
export function progressIndex(status: ActivityStatus): number {
  return PROGRESS_STEPS.findIndex((step) => step.status === status);
}

/** The step the primary action advances into, or null when nothing is left. */
export function nextStep(status: ActivityStatus): ProgressStep | null {
  const index = progressIndex(status);
  if (index === -1) return PROGRESS_STEPS[0] ?? null;
  return PROGRESS_STEPS[index + 1] ?? null;
}

/** Short status label for list pills and headers. */
export function activityLabel(status: ActivityStatus): string {
  if (status === 'driver_not_assigned') return 'Assigned';
  return PROGRESS_STEPS[progressIndex(status)]?.label ?? status.replace(/_/g, ' ');
}

/**
 * Which leg of the job an issue belongs to. Anything up to (and including)
 * collection is a pickup problem; everything after is a delivery problem.
 */
export function incidentStageFor(status: ActivityStatus): IncidentStage {
  return progressIndex(status) < progressIndex('picked_up') ? 'pickup' : 'delivery';
}