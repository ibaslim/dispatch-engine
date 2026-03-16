import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { MeResponse, LoginRequest, LoginResponse } from '@dispatch/shared/contracts';

const ACCESS_KEY = 'dispatch:access_token';
const REFRESH_KEY = 'dispatch:refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<MeResponse | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this._currentUser() !== null);
  readonly isPlatformAdmin = computed(
    () => this._currentUser()?.is_platform_admin ?? false
  );

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  async login(email: string, password: string): Promise<void> {
    const req: LoginRequest = { email, password };
    const res = await firstValueFrom(
      this.http.post<LoginResponse>('/api/v1/auth/login', req)
    );
    localStorage.setItem(ACCESS_KEY, res.access_token);
    localStorage.setItem(REFRESH_KEY, res.refresh_token);
    await this.loadCurrentUser();
    await this.router.navigate(['/dashboard']);
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

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/logout', {}));
    } catch { /* ignore */ }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this._currentUser.set(null);
    await this.router.navigate(['/login']);
  }
}
