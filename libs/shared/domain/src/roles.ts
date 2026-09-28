/** Platform-wide roles */
export enum PlatformRole {
  PlatformAdmin = 'platform_admin',
  OperationalAdmin = 'operational_admin',
  AccountsAdmin = 'accounts_admin',
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
  PlatformRole.OperationalAdmin,
  PlatformRole.AccountsAdmin,
  TenantRole.Vendor,
  TenantRole.Driver,
  TenantRole.Individual,
];

/** Roles for accounts that are not scoped to any tenant (invited platform users). */
export const PLATFORM_LEVEL_ROLES: PlatformRole[] = [
  PlatformRole.PlatformAdmin,
  PlatformRole.OperationalAdmin,
  PlatformRole.AccountsAdmin,
];
