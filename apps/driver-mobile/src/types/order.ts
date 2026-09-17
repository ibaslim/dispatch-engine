// Order wire types live in @dispatch/shared/contracts; re-exported so app code keeps importing from @types.
export type {
  ActivityStatus,
  DriverInfo,
  DriverOrder,
  DriverOrderItem as OrderItem,
  IncidentReason,
  IncidentReport,
  IncidentStage,
  OrderStatus,
  PickupVerification,
  ProofOfDelivery,
} from '@dispatch/shared/contracts';

export {
  DELIVERY_INCIDENT_REASONS,
  INCIDENT_REASONS_REQUIRING_DESCRIPTION,
  PICKUP_INCIDENT_REASONS,
} from '@dispatch/shared/contracts';

/** A local file selected from the camera or gallery, for multipart upload. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}
