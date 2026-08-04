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

/**
 * The custom-server-URL override is a **non-production** convenience:
 * IpConfigScreen lets you point the app at a machine by hand instead of
 * rebuilding when a LAN IP changes. Normally the base URL is fully resolved at
 * build time from `EXPO_PUBLIC_API_BASE_URL`, so there is nothing to load.
 *
 * It is on in dev, and can be switched on for a standalone *test* APK with
 * `EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE=true` — a release build is otherwise
 * indistinguishable from production here, and a tester on a laptop whose IP
 * moved would have no way to recover. Leave the flag unset for production so
 * the shipped app can only ever talk to its built-in base URL.
 *
 * Keeping the override behind `__DEV__` matters beyond dead-code removal: the
 * SecureStore read is async, so in dev a caller that fires before it settles
 * would talk to `DEFAULT_API_URL`. That is exactly what happens when Android
 * relaunches the JS context headlessly for the background location task —
 * fixes would post to `localhost` instead of the configured LAN IP. Requests
 * await `whenReady()` to close that window; in production it is already resolved.
 */
const OVERRIDE_ENABLED =
  __DEV__ || process.env['EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE'] === 'true';

let readyPromise: Promise<void> | null = OVERRIDE_ENABLED ? null : Promise.resolve();

function whenReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = initApiBaseUrl().then(
      () => undefined,
      () => undefined, // A failed read leaves the default in place; never block forever.
    );
  }
  return readyPromise;
}

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
  const urlPattern = /^(https?:\/\/[^/:]+)(\/.*)?$/;
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

/** Load the dev server IP override from SecureStore on startup. No-op in release builds. */
export async function initApiBaseUrl(): Promise<string> {
  if (!OVERRIDE_ENABLED) return activeBaseUrl;
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

/** True when the server-IP override is usable (development builds only). */
export const isServerUrlOverrideAvailable = OVERRIDE_ENABLED;

/** Save a dev server IP/URL and update the active traffic route immediately. */
export async function setCustomServerUrl(rawInput: string): Promise<string> {
  if (!OVERRIDE_ENABLED) return activeBaseUrl;
  const formatted = formatServerUrl(rawInput);
  await SecureStore.setItemAsync(CUSTOM_API_URL_KEY, formatted);
  activeBaseUrl = formatted;
  apiClient = createClient(activeBaseUrl);
  return formatted;
}

/** Reset the server IP back to the build-time default. */
export async function resetCustomServerUrl(): Promise<string> {
  if (!OVERRIDE_ENABLED) return activeBaseUrl;
  await SecureStore.deleteItemAsync(CUSTOM_API_URL_KEY);
  activeBaseUrl = DEFAULT_API_URL;
  apiClient = createClient(activeBaseUrl);
  return DEFAULT_API_URL;
}

/** Pings the target server URL to verify connection before saving. */
export async function testServerConnection(rawInput: string): Promise<{ success: boolean; message: string }> {
  const targetUrl = formatServerUrl(rawInput);
  const endpointsToTry = ['/health', '/docs', '/openapi.json'];

  // Keep the last transport error: reporting only "could not reach server"
  // hides the difference between a wrong IP, a timeout, and Android's cleartext
  // policy rejecting http:// outright — which look identical to the user but
  // need completely different fixes.
  let lastError: string | null = null;

  for (const endpoint of endpointsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s per attempt

    try {
      const res = await fetch(`${targetUrl}${endpoint}`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok || res.status === 200 || res.status === 304 || res.status === 307) {
        return { success: true, message: `Successfully connected to ${targetUrl}` };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = controller.signal.aborted ? 'Timed out after 4s' : String((err as Error)?.message ?? err);
      // Try next fallback endpoint.
    }
  }

  const cleartextBlocked =
    targetUrl.startsWith('http://') && !!lastError && /cleartext/i.test(lastError);

  return {
    success: false,
    message: cleartextBlocked
      ? `This build blocks plain HTTP. Rebuild with ANDROID_ALLOW_CLEARTEXT=true, or use an https:// address.`
      : `Could not reach server at ${targetUrl}. Check IP & ensure phone is on same Wi-Fi.${
          lastError ? ` (${lastError})` : ''
        }`,
  };
}

// Kick the dev override read off immediately so it is usually settled by the
// time the first request lands; `whenReady()` covers the case where it isn't.
whenReady();

export async function login(email: string, password: string): Promise<LoginOutcome> {
  await whenReady();
  return apiClient.login({ email, password }) as Promise<LoginOutcome>;
}

export async function me(): Promise<MeResponse> {
  await whenReady();
  return apiClient.me();
}

export async function logout(): Promise<void> {
  await whenReady();
  return apiClient.logout();
}

export async function fetchWithAuth<T>(path: string): Promise<T> {
  await whenReady();
  return apiClient.getPath<T>(path);
}

export async function postWithAuth<T = void>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  await whenReady();
  return apiClient.postPath<T>(path, body, true, signal);
}

export async function patchWithAuth<T = void>(path: string, body: unknown): Promise<T> {
  await whenReady();
  return apiClient.patchPath<T>(path, body);
}

export async function uploadWithAuth<T = void>(path: string, form: FormData): Promise<T> {
  await whenReady();
  return apiClient.postMultipart<T>(path, form);
}

export async function deleteWithAuth<T = void>(path: string, signal?: AbortSignal): Promise<T> {
  await whenReady();
  return apiClient.deletePath<T>(path, true, signal);
}

export async function fetchPublic<T>(path: string): Promise<T> {
  await whenReady();
  return apiClient.getPath<T>(path, false);
}

