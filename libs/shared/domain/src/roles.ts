/** Platform-wide roles */
export enum PlatformRole {
  PlatformAdmin = 'platform_admin',
}

/** Tenant-level roles */
export enum TenantRole {
  Vendor = 'vendor',
  Driver = 'driver',
  Individual = 'individual',
}

export type UserRole = PlatformRole | TenantRole;

export const ALL_ROLES: UserRole[] = [
  PlatformRole.PlatformAdmin,
  TenantRole.Vendor,
  TenantRole.Driver,
  TenantRole.Individual,
];
