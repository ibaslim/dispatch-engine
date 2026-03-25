/**
 * Shared API contracts (generated from OpenAPI spec).
 *
 * Run `nx run shared-contracts:generate` to regenerate from the running API.
 * The generated file at `./generated/api-schema.ts` is gitignored — run
 * the generator in CI before building frontend apps.
 */

// Re-export generated types once available:
// export type { components, paths, operations } from './generated/api-schema';

// Manual DTO interfaces used before generation is wired up:

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  is_platform_admin: boolean;
  tenant_id: string | null;
  roles: string[];
}

export interface InviteTenantAdminRequest {
  email: string;
  name: string;
  tenant_name: string;
}

export interface AcceptInvitationRequest {
  token: string;
  password: string;
  name?: string;
}

export interface StoreResponse {
  id: string;
  name: string;
  tenant_id: string;
  status: string;
  created_at: string;
}

export interface CreateStoreRequest {
  name: string;
}

export interface TrackingResponse {
  order_id: string;
  status: string;
  driver_name: string | null;
  estimated_arrival: string | null;
  last_location: { lat: number; lng: number } | null;
}

export interface PostResponse {
  id: string;
  title: string;
  summary: string;
  content: string;
  is_published: boolean;
  created_at: string;
}
