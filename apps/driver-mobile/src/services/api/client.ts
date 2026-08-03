import type { LoginResponse, MeResponse } from '@dispatch/shared/contracts';
import { DispatchApiClient } from '@dispatch/shared/api-client';
import * as SecureStore from 'expo-secure-store';
import { SecureTokenStorage } from '@services/storage';

export type { MeResponse } from '@dispatch/shared/contracts';

export type LoginOutcome = LoginResponse & {
  status?: 'pending' | 'pre_pending' | 'suspended';
  message?: string;
};

const CUSTOM_API_URL_KEY = 'dispatch.custom_api_base_url';
const DEFAULT_API_URL = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:8000';

let activeBaseUrl = DEFAULT_API_URL;
let apiClient: DispatchApiClient = createClient(activeBaseUrl);

function createClient(baseUrl: string): DispatchApiClient {
  return new DispatchApiClient({
    baseUrl,
    tokenStorage: new SecureTokenStorage(),
  });
}

/** Formats a user input string into a full HTTP base URL. */
export function formatServerUrl(input: string): string {
  let cleaned = input.trim();
  if (!cleaned) return DEFAULT_API_URL;
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`;
  }
  // If no port specified and looks like IP or localhost without port, default to :8000
  const urlPattern = /^(https?:\/\/[^\/:]+)(\/.*)?$/;
  const match = cleaned.match(urlPattern);
  if (match && !match[1].includes(':8000') && !match[1].includes(':443') && !match[1].includes(':80')) {
    // Check if port is missing
    const hostPart = match[1];
    if (!hostPart.split('://')[1].includes(':')) {
      cleaned = `${hostPart}:8000${match[2] ?? ''}`;
    }
  }
  return cleaned.replace(/\/$/, '');
}

/** Load configured server IP from SecureStore on startup. */
export async function initApiBaseUrl(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(CUSTOM_API_URL_KEY);
    if (stored) {
      activeBaseUrl = stored;
      apiClient = createClient(activeBaseUrl);
    }
  } catch (err) {
    console.warn('[API CLIENT] Could not load custom API URL from storage:', err);
  }
  return activeBaseUrl;
}

/** Returns the active API base URL currently in use. */
export function getActiveServerUrl(): string {
  return activeBaseUrl;
}

/** Save a custom server IP/URL and update active traffic route immediately. */
export async function setCustomServerUrl(rawInput: string): Promise<string> {
  const formatted = formatServerUrl(rawInput);
  await SecureStore.setItemAsync(CUSTOM_API_URL_KEY, formatted);
  activeBaseUrl = formatted;
  apiClient = createClient(activeBaseUrl);
  return formatted;
}

/** Reset server IP back to the default auto-detected LAN IP. */
export async function resetCustomServerUrl(): Promise<string> {
  await SecureStore.deleteItemAsync(CUSTOM_API_URL_KEY);
  activeBaseUrl = DEFAULT_API_URL;
  apiClient = createClient(activeBaseUrl);
  return DEFAULT_API_URL;
}

/** Pings the target server URL to verify connection before saving. */
export async function testServerConnection(rawInput: string): Promise<{ success: boolean; message: string }> {
  const targetUrl = formatServerUrl(rawInput);
  const endpointsToTry = ['/health', '/docs', '/openapi.json'];

  for (const endpoint of endpointsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s per attempt

    try {
      const res = await fetch(`${targetUrl}${endpoint}`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok || res.status === 200 || res.status === 304 || res.status === 307) {
        return { success: true, message: `Successfully connected to ${targetUrl}` };
      }
    } catch {
      clearTimeout(timeoutId);
      // Try next fallback endpoint
    }
  }

  return {
    success: false,
    message: `Could not reach server at ${targetUrl}. Check IP & ensure phone is on same Wi-Fi.`,
  };
}

// Auto-initialize stored URL asynchronously
initApiBaseUrl().catch(console.error);

export function login(email: string, password: string): Promise<LoginOutcome> {
  return apiClient.login({ email, password }) as Promise<LoginOutcome>;
}

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

