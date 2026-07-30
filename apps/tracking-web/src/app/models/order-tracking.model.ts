export interface OrderTrackingDetails {
  order_number: string;
  status: string;
  activity_status: string;
  driver_id: string | null;
  driver_name: string | null;
  pickup_name: string | null;
  pickup_address: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  delivery_name: string | null;
  delivery_address: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  items_count: number;
  created_at: string | null;

  pickup_initiated_at: string | null;
  picked_up_at: string | null;
  delivery_initiated_at: string | null;
  delivery_in_progress_at: string | null;
  delivered_at: string | null;
}