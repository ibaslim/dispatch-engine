import type { NewOrderFormValue } from '@models/new-order-form/new-order-form.model';

export interface StopSchedule {
  date: string;
  time: string;
  timeSpecified: boolean;
}

/** The schedule an order had when editing began; stops left as-is are exempt from the past-date rule. */
export interface ScheduleBaseline {
  pickup: StopSchedule;
  delivery: StopSchedule;
}

export interface ScheduleErrors {
  pickupDate: string;
  pickupTime: string;
  deliveryDate: string;
  deliveryTime: string;
}

/** Browser-local `YYYY-MM-DD`. */
export function localDate(now = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Browser-local `HH:MM`. */
export function localTime(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function pickupSchedule(value: NewOrderFormValue): StopSchedule {
  return {
    date: value.pickup.pickupDate,
    time: value.pickup.pickupTimeSpecified ? value.pickup.pickupTime : '',
    timeSpecified: value.pickup.pickupTimeSpecified,
  };
}

export function deliverySchedule(value: NewOrderFormValue): StopSchedule {
  return {
    date: value.delivery.deliveryDate,
    time: value.delivery.deliveryTimeSpecified ? value.delivery.deliveryTime : '',
    timeSpecified: value.delivery.deliveryTimeSpecified,
  };
}

export function baselineFrom(value: NewOrderFormValue): ScheduleBaseline {
  return { pickup: pickupSchedule(value), delivery: deliverySchedule(value) };
}

function unchanged(stop: StopSchedule, original: StopSchedule | undefined): boolean {
  return (
    !!original &&
    stop.date === original.date &&
    stop.timeSpecified === original.timeSpecified &&
    stop.time === original.time
  );
}

/** Every schedule problem at once, keyed by field; an empty string means the field is fine. */
export function scheduleErrors(
  value: NewOrderFormValue,
  baseline: ScheduleBaseline | null,
  now = new Date(),
): ScheduleErrors {
  const today = localDate(now);
  const clock = localTime(now);
  const pickup = pickupSchedule(value);
  const delivery = deliverySchedule(value);
  const pickupKept = unchanged(pickup, baseline?.pickup);
  const deliveryKept = unchanged(delivery, baseline?.delivery);
  const errors: ScheduleErrors = { pickupDate: '', pickupTime: '', deliveryDate: '', deliveryTime: '' };

  if (!pickup.date) {
    errors.pickupDate = 'Choose a pickup date.';
  } else if (!pickupKept && pickup.date < today) {
    errors.pickupDate = "Pickup can't be in the past.";
  }

  if (pickup.timeSpecified) {
    if (!pickup.time) {
      errors.pickupTime = 'Choose a pickup time, or untick "Set a specific time".';
    } else if (!pickupKept && pickup.date === today && pickup.time < clock) {
      errors.pickupTime = 'That time has already passed today.';
    }
  }

  if (!delivery.date) {
    errors.deliveryDate = 'Choose a delivery date.';
  } else if (!deliveryKept && delivery.date < today) {
    errors.deliveryDate = "Delivery can't be in the past.";
  } else if (pickup.date && delivery.date < pickup.date) {
    errors.deliveryDate = "Delivery can't be before the pickup date.";
  }

  if (delivery.timeSpecified) {
    if (!delivery.time) {
      errors.deliveryTime = 'Choose a delivery time, or untick "Set a specific time".';
    } else if (!deliveryKept && delivery.date === today && delivery.time < clock) {
      errors.deliveryTime = 'That time has already passed today.';
    } else if (pickup.time && delivery.date === pickup.date && delivery.time <= pickup.time) {
      errors.deliveryTime = 'Delivery must be after the pickup time.';
    }
  }

  return errors;
}

export function hasScheduleErrors(errors: ScheduleErrors): boolean {
  return Object.values(errors).some(Boolean);
}
