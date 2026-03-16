import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenStorage';

const API_BASE = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:8000';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? 'Login failed');
  }
  const data = (await res.json()) as LoginResponse;
  await setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function logout(): Promise<void> {
  const token = await getAccessToken();
  if (token) {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  await clearTokens();
}

export async function fetchWithAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Try refresh
    const refresh = await getRefreshToken();
    if (refresh) {
      const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (refreshRes.ok) {
        const newTokens = (await refreshRes.json()) as { access_token: string; refresh_token: string };
        await setTokens(newTokens.access_token, newTokens.refresh_token);
        headers['Authorization'] = `Bearer ${newTokens.access_token}`;
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      } else {
        await clearTokens();
        throw new Error('Session expired');
      }
    }
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
