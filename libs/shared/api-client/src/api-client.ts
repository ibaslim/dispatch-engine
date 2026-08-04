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
  PostResponse,
} from '@dispatch/shared/contracts';
import { LocalTokenStorage, type TokenStorage } from './token-storage';

export interface ApiClientConfig {
  baseUrl: string;
  tokenStorage?: TokenStorage;
}

/**
 * A non-2xx response. `message` stays the server's `detail` string exactly as
 * before, so existing `err.message` checks keep working; `status` is added for
 * callers that must branch on the code — an order accept race returns 409 and
 * 410 with different meanings ("someone else took it" vs "the offer expired")
 * and both are normal outcomes, not failures.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    // Extending a builtin loses the prototype under some downlevel transpiles
    // (React Native's Babel pipeline among them), which would silently break
    // `instanceof` at runtime. Restore it explicitly.
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Narrow an unknown catch value to an ApiError. Duck-typed rather than a bare
 * `instanceof` so it holds even if the error crossed a module realm.
 */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof Error && typeof (value as ApiError).status === 'number';
}

export class DispatchApiClient {
  private readonly baseUrl: string;
  private readonly storage: TokenStorage;

  /**
   * In-flight refresh promise. Concurrent 401s share a single refresh call so
   * the rotating (single-use) refresh token is only spent once; otherwise the
   * losers of the race would fail and clear the tokens, forcing a logout.
   */
  private refreshInFlight: Promise<LoginResponse> | null = null;

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
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<LoginResponse> {
    const refresh_token = await this.storage.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token available');
    const req: RefreshRequest = { refresh_token };
    const res = await this.post<LoginResponse>('/api/v1/auth/refresh', req, false);
    await this.storage.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async logout(): Promise<void> {
    const refresh_token = await this.storage.getRefreshToken();
    if (refresh_token) {
      await this.post('/api/v1/auth/logout', { refresh_token }, false).catch(() => undefined);
    }
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

  async getPosts(limit = 20): Promise<PostResponse[]> {
    return this.get<PostResponse[]>(`/api/v1/posts?limit=${limit}`, false);
  }

  async getPath<T>(path: string, auth = true): Promise<T> {
    return this.get<T>(path, auth);
  }

  async postPath<T = void>(
    path: string,
    body: unknown,
    auth = true,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.post<T>(path, body, auth, signal);
  }

  async patchPath<T = void>(path: string, body: unknown, auth = true): Promise<T> {
    return this.request<T>('PATCH', path, body, auth);
  }

  async deletePath<T = void>(path: string, auth = true, signal?: AbortSignal): Promise<T> {
    return this.request<T>('DELETE', path, undefined, auth, signal);
  }

  /**
   * Multipart upload (e.g. proof-of-delivery images). The runtime derives the
   * `Content-Type` boundary from the FormData, so we must not set that header
   * ourselves — a boundary-less type is unparseable by the server.
   */
  async postMultipart<T = void>(path: string, form: FormData): Promise<T> {
    return this.request<T>('POST', path, form, true);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async get<T>(path: string, auth = true): Promise<T> {
    return this.request<T>('GET', path, undefined, auth);
  }

  private async post<T = void>(
    path: string,
    body: unknown,
    auth = true,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.request<T>('POST', path, body, auth, signal);
  }

  private buildInit(
    method: string,
    body: unknown,
    token: string | null,
    signal?: AbortSignal,
  ): RequestInit {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (body === undefined) return { method, headers, signal };
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      return { method, headers, body, signal };
    }

    headers['Content-Type'] = 'application/json';
    return { method, headers, body: JSON.stringify(body), signal };
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    auth: boolean,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const token = auth ? await this.storage.getAccessToken() : null;
    const res = await fetch(url, this.buildInit(method, body, token, signal));

    if (res.status === 401 && auth) {
      // Attempt token refresh
      try {
        await this.refresh();
        const newToken = await this.storage.getAccessToken();
        const retryRes = await fetch(url, this.buildInit(method, body, newToken, signal));
        if (!retryRes.ok) throw await this.toError(retryRes);
        return this.toResult<T>(retryRes);
      } catch (err) {
        // A caller-cancelled request (timeout/unmount) says nothing about the
        // session — clearing tokens here would log the driver out on a flaky
        // network. Only a genuine refresh failure invalidates the session.
        if (signal?.aborted || (err as Error)?.name === 'AbortError') throw err;
        await this.storage.clearTokens();
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!res.ok) throw await this.toError(res);
    return this.toResult<T>(res);
  }

  private toResult<T>(res: Response): Promise<T> {
    if (res.status === 204) return Promise.resolve(undefined as unknown as T);
    return res.json() as Promise<T>;
  }

  private async toError(res: Response): Promise<Error> {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) message = body.detail;
    } catch { /* ignore */ }
    return new ApiError(res.status, message);
  }
}
