import type { LoginResponse, MeResponse } from '@dispatch/shared/contracts';
import { DispatchApiClient } from '@dispatch/shared/api-client';
import { SecureTokenStorage } from '@services/storage';

export type { MeResponse } from '@dispatch/shared/contracts';

/**
 * The `/auth/login` endpoint returns a union: a token pair on success, or a
 * status-carrying body when the account can't sign in yet (onboarding pending
 * or suspended). The shared `LoginResponse` only models the happy path, so we
 * widen it here to let callers branch on `status`.
 */
export type LoginOutcome = LoginResponse & {
  status?: 'pending' | 'pre_pending' | 'suspended';
  message?: string;
};

const apiBaseUrl = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:8000';

const apiClient = new DispatchApiClient({
  baseUrl: apiBaseUrl,
  tokenStorage: new SecureTokenStorage(),
});

export function login(email: string, password: string): Promise<LoginOutcome> {
  return apiClient.login({ email, password }) as Promise<LoginOutcome>;
}

/** Fetch the signed-in user's identity, roles, and tenant role. */
export function me(): Promise<MeResponse> {
  return apiClient.me();
}

export function logout(): Promise<void> {
  return apiClient.logout();
}

export function fetchWithAuth<T>(path: string): Promise<T> {
  return apiClient.getPath<T>(path);
}

export function postWithAuth<T = void>(path: string, body: unknown): Promise<T> {
  return apiClient.postPath<T>(path, body);
}

export function patchWithAuth<T = void>(path: string, body: unknown): Promise<T> {
  return apiClient.patchPath<T>(path, body);
}

export function uploadWithAuth<T = void>(path: string, form: FormData): Promise<T> {
  return apiClient.postMultipart<T>(path, form);
}

export function deleteWithAuth<T = void>(path: string): Promise<T> {
  return apiClient.deletePath<T>(path);
}

export function fetchPublic<T>(path: string): Promise<T> {
  return apiClient.getPath<T>(path, false);
}
