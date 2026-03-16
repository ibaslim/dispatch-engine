/** Platform-wide roles */
export enum PlatformRole {
  PlatformAdmin = 'platform_admin',
}

/** Tenant-level roles */
export enum TenantRole {
  TenantAdmin = 'tenant_admin',
  CentralDispatcher = 'central_dispatcher',
  StoreDispatcher = 'store_dispatcher',
  Driver = 'driver',
}

export type UserRole = PlatformRole | TenantRole;

export const ALL_ROLES: UserRole[] = [
  PlatformRole.PlatformAdmin,
  TenantRole.TenantAdmin,
  TenantRole.CentralDispatcher,
  TenantRole.StoreDispatcher,
  TenantRole.Driver,
];
