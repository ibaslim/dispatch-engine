/** Order lifecycle status */
export enum OrderStatus {
  Pending = 'pending',
  Assigned = 'assigned',
  PickedUp = 'picked_up',
  InTransit = 'in_transit',
  Delivered = 'delivered',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/** Driver availability status */
export enum DriverStatus {
  Offline = 'offline',
  Available = 'available',
  OnJob = 'on_job',
}

/** Invitation status */
export enum InvitationStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Expired = 'expired',
  Revoked = 'revoked',
}

/** Store status */
export enum StoreStatus {
  Active = 'active',
  Inactive = 'inactive',
}
