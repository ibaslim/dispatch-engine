import type { LoginResponse } from '@dispatch/shared/contracts';
import { DispatchApiClient } from '@dispatch/shared/api-client';
import { SecureTokenStorage } from './secureTokenStorage';

const apiBaseUrl = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:8000';

const apiClient = new DispatchApiClient({
  baseUrl: apiBaseUrl,
  tokenStorage: new SecureTokenStorage(),
});

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiClient.login({ email, password });
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

export function fetchPublic<T>(path: string): Promise<T> {
  return apiClient.getPath<T>(path, false);
}
