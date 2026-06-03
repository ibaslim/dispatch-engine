import { Component, OnInit, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AcceptInvitationRequest, LoginResponse } from '@dispatch/shared/contracts';
import { TenantRole } from '@dispatch/shared/domain';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-invite-accept',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-md">
        <div>
          <h2 class="text-center text-3xl font-extrabold text-gray-900">
            Create Account
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600">
            Create your account to get started
          </p>
        </div>

        @if (success()) {
          
        } @else {
          <form class="mt-8 space-y-6" (ngSubmit)="onSubmit()">
            @if (errorMessage()) {
              <div class="rounded-md bg-red-50 p-4">
                <p class="text-sm text-red-800">{{ errorMessage() }}</p>
              </div>
            }

            <div class="space-y-4">
              <div>
                <label for="username" class="block text-sm font-medium text-gray-700">
                  Username <span class="text-red-500">*</span>
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  [(ngModel)]="username"
                  (blur)="checkUsernameAvailability()"
                  required
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Choose a unique username"
                />
                @if (usernameChecking()) {
                  <p class="mt-1 text-sm text-gray-500">Checking availability...</p>
                }
                @if (usernameError()) {
                  <p class="mt-1 text-sm text-red-600">{{ usernameError() }}</p>
                }
                @if (usernameAvailable()) {
                  <p class="mt-1 text-sm text-green-600">✓ Username available</p>
                }
              </div>

              <div>
                <label for="password" class="block text-sm font-medium text-gray-700">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  [(ngModel)]="password"
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div>
                <label for="confirmPassword" class="block text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  [(ngModel)]="confirmPassword"
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <button
              type="submit"
              [disabled]="isLoading() || !token() || !username || !usernameAvailable()"
              class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isLoading() ? 'Activating\u2026' : 'Submit' }}
            </button>
          </form>
        }
      </div>k
    </div>
  `
})
export class InviteAcceptComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  token = signal<string | null>(null);
  role = signal<string | null>(null);
  username = '';
  password = '';
  confirmPassword = '';
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  success = signal(false);
  usernameChecking = signal(false);
  usernameError = signal<string | null>(null);
  usernameAvailable = signal(false);

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token');
    const r = this.route.snapshot.queryParamMap.get('role');
    this.token.set(t);
    this.role.set(r);
    if (!t) {
      this.errorMessage.set('Invalid or missing invitation token.');
    }
  }

  async checkUsernameAvailability(): Promise<void> {
    if (!this.username || this.username.length === 0) {
      this.usernameAvailable.set(false);
      this.usernameError.set(null);
      return;
    }

    this.usernameChecking.set(true);
    this.usernameError.set(null);

    try {
      const res = await firstValueFrom(
        this.http.get<{ available: boolean }>(
          `/api/v1/tenants/check-username/${encodeURIComponent(this.username)}`
        )
      );
      if (res.available) {
        this.usernameAvailable.set(true);
        this.usernameError.set(null);
      } else {
        this.usernameAvailable.set(false);
        this.usernameError.set('This username is already taken.');
      }
    } catch {
      this.usernameAvailable.set(false);
      this.usernameError.set('Error checking username availability.');
    } finally {
      this.usernameChecking.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.token()) return;
    if (!this.username) {
      this.errorMessage.set('Username is required.');
      return;
    }
    if (!this.usernameAvailable()) {
      this.errorMessage.set('Please choose an available username.');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }
    if (this.password.length < 8) {
      this.errorMessage.set('Password must be at least 8 characters.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const req: AcceptInvitationRequest = {
        token: this.token()!,
        password: this.password,
        username: this.username,
      };
      const res = await firstValueFrom(
        this.http.post<any>('/api/v1/invitations/accept', req)
      );

      // Store tokens and handle potential pre_pending state
      // We don't store tokens here as per requirement to go to login page
      /*
      if (res.access_token && res.refresh_token) {
        this.auth.storeTokens(res.access_token, res.refresh_token);
      }
      */

      this.success.set(true);
      this.toast.success('Account created successfully.');
await this.router.navigate(['/login'], {
  queryParams: {
    registered: 'true',
    email: res.email || ''
  }
});

    } catch (err: unknown) {
      this.toast.error('Invitation failed.');
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to accept invitation.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
