import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RefreshRequest,
  AcceptInvitationRequest,
  InviteTenantAdminRequest,
  StoreResponse,
  CreateStoreRequest,
  TrackingResponse,
} from '@dispatch/shared/contracts';
import { LocalTokenStorage, type TokenStorage } from './token-storage';

export interface ApiClientConfig {
  baseUrl: string;
  tokenStorage?: TokenStorage;
}

export class DispatchApiClient {
  private readonly baseUrl: string;
  private readonly storage: TokenStorage;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.storage = config.tokenStorage ?? new LocalTokenStorage();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(req: LoginRequest): Promise<LoginResponse> {
    const res = await this.post<LoginResponse>('/api/v1/auth/login', req, false);
    await this.storage.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async refresh(): Promise<LoginResponse> {
    const refresh_token = await this.storage.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token available');
    const req: RefreshRequest = { refresh_token };
    const res = await this.post<LoginResponse>('/api/v1/auth/refresh', req, false);
    await this.storage.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async logout(): Promise<void> {
    await this.post('/api/v1/auth/logout', {}).catch(() => undefined);
    await this.storage.clearTokens();
  }

  async me(): Promise<MeResponse> {
    return this.get<MeResponse>('/api/v1/auth/me');
  }

  async forgotPassword(email: string): Promise<void> {
    await this.post('/api/v1/auth/forgot-password', { email }, false);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.post('/api/v1/auth/reset-password', { token, password }, false);
  }

  // ── Invitations ───────────────────────────────────────────────────────────

  async inviteTenantAdmin(req: InviteTenantAdminRequest): Promise<void> {
    await this.post('/api/v1/platform/tenants/invite', req);
  }

  async acceptInvitation(req: AcceptInvitationRequest): Promise<LoginResponse> {
    return this.post<LoginResponse>('/api/v1/invitations/accept', req, false);
  }

  // ── Stores ────────────────────────────────────────────────────────────────

  async getStores(): Promise<StoreResponse[]> {
    return this.get<StoreResponse[]>('/api/v1/stores');
  }

  async createStore(req: CreateStoreRequest): Promise<StoreResponse> {
    return this.post<StoreResponse>('/api/v1/stores', req);
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  async getTracking(token: string): Promise<TrackingResponse> {
    return this.get<TrackingResponse>(`/api/v1/tracking/${token}`, false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async get<T>(path: string, auth = true): Promise<T> {
    return this.request<T>('GET', path, undefined, auth);
  }

  private async post<T = void>(path: string, body: unknown, auth = true): Promise<T> {
    return this.request<T>('POST', path, body, auth);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    auth: boolean,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth) {
      const token = await this.storage.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && auth) {
      // Attempt token refresh
      try {
        await this.refresh();
        const newToken = await this.storage.getAccessToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        const retryRes = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok) throw await this.toError(retryRes);
        if (retryRes.status === 204) return undefined as unknown as T;
        return retryRes.json() as Promise<T>;
      } catch {
        await this.storage.clearTokens();
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!res.ok) throw await this.toError(res);
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  private async toError(res: Response): Promise<Error> {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) message = body.detail;
    } catch { /* ignore */ }
    return new Error(message);
  }
}
