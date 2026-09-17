export interface OrderTrackingDetails {
  order_number: string;
  status: string;
  activity_status: string;
  driver_id: string | null;
  driver_name: string | null;
  pickup_name: string | null;
  pickup_address: string | null;
  /** Wall-clock time, no zone ("2026-09-20T13:40:00"). */
  pickup_planned_at: string | null;
  pickup_time_specified: boolean | null;
  delivery_name: string | null;
  delivery_address: string | null;
  delivery_planned_at: string | null;
  delivery_time_specified: boolean | null;
  items_count: number;
  created_at: string | null;

  pickup_initiated_at: string | null;
  picked_up_at: string | null;
  delivery_initiated_at: string | null;
  delivery_in_progress_at: string | null;
  delivered_at: string | null;
}