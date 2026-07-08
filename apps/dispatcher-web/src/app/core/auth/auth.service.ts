import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { MeResponse, LoginRequest } from '@dispatch/shared/contracts';
import { ToastService } from '../toast/toast.service';

const ACCESS_KEY = 'dispatch:access_token';
const REFRESH_KEY = 'dispatch:refresh_token';

interface AuthStatusResponse {
  status?: 'pending' | 'pre_pending' | 'suspended';
  role?: string;
  access_token?: string;
  refresh_token?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly _currentUser = signal<MeResponse | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this._currentUser() !== null);
  readonly isPlatformAdmin = computed(
    () => this._currentUser()?.is_platform_admin ?? false
  );
  readonly isDriver = computed(
    () => this._currentUser()?.tenant_role === 'driver'
  );
  readonly tenantId = computed(
    () => this._currentUser()?.tenant_id ?? null
  );

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  storeTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }

  async login(email: string, password: string): Promise<void> {
    const req: LoginRequest = { email, password };
    const res = await firstValueFrom(
      this.http.post<AuthStatusResponse>('/api/v1/auth/login', req)
    );

    // Check if response indicates pending onboarding or approval
    if (res.status === 'pending') {
      if (res.access_token && res.refresh_token) {
        this.storeTokens(res.access_token, res.refresh_token);
      }
      await this.router.navigate(['/onboarding/pending']);
      return;
    }

    if (res.status === 'pre_pending') {
      if (res.access_token && res.refresh_token) {
        this.storeTokens(res.access_token, res.refresh_token);
      }
      const role = res.role?.toLowerCase() || 'vendor';
      await this.router.navigate([`/onboarding/${role}`]);
      return;
    }

    if (res.status === 'suspended') {
      if (res.access_token && res.refresh_token) {
        this.storeTokens(res.access_token, res.refresh_token);
      }
      await this.loadCurrentUser();
      await this.router.navigate(['/suspended']);
      this.toast.error('Your account has been suspended. Please contact support.');
      return;
    }

    // Normal login flow
    if (!res.access_token || !res.refresh_token) {
      throw new Error('Login response is missing tokens.');
    }
    localStorage.setItem(ACCESS_KEY, res.access_token);
    localStorage.setItem(REFRESH_KEY, res.refresh_token);
    await this.loadCurrentUser();
    await this.router.navigate(['/orders']);
  }

  async loadCurrentUser(): Promise<void> {
    try {
      const me = await firstValueFrom(
        this.http.get<MeResponse>('/api/v1/auth/me')
      );
      this._currentUser.set(me);
    } catch {
      this._currentUser.set(null);
    }
  }
  clearTokens(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this._currentUser.set(null);
  }

  /**
   * In-flight refresh promise. Concurrent 401s share a single refresh call so
   * the rotating (single-use) refresh token is only spent once; otherwise the
   * losers of the race would fail with 401 and force a logout.
   */
  private refreshInFlight: Promise<void> | null = null;

  refreshAccessToken(): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available.');
    }

    const res = await firstValueFrom(
      this.http.post<TokenResponse>('/api/v1/auth/refresh', {
        refresh_token: refreshToken,
      })
    );
    this.storeTokens(res.access_token, res.refresh_token);
  }

  async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    try {
      if (refreshToken) {
        await firstValueFrom(
          this.http.post('/api/v1/auth/logout', {
            refresh_token: refreshToken,
          })
        );
      }
    } catch { /* ignore */ }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this._currentUser.set(null);
    await this.router.navigate(['/login']);
  }
}
