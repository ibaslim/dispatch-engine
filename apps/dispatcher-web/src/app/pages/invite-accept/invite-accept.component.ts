import { Component, OnInit, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AcceptInvitationRequest, LoginResponse } from '@dispatch/shared/contracts';

@Component({
  selector: 'app-invite-accept',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-md">
        <div>
          <h2 class="text-center text-3xl font-extrabold text-gray-900">
            Accept Invitation
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600">
            Set your password to activate your account
          </p>
        </div>

        @if (success()) {
          <div class="rounded-md bg-green-50 p-4">
            <p class="text-sm text-green-800">
              Account activated! Redirecting to dashboard&hellip;
            </p>
          </div>
        } @else {
          <form class="mt-8 space-y-6" (ngSubmit)="onSubmit()">
            @if (errorMessage()) {
              <div class="rounded-md bg-red-50 p-4">
                <p class="text-sm text-red-800">{{ errorMessage() }}</p>
              </div>
            }

            <div class="space-y-4">
              <div>
                <label for="name" class="block text-sm font-medium text-gray-700">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  [(ngModel)]="name"
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Your name"
                />
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
              [disabled]="isLoading() || !token()"
              class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isLoading() ? 'Activating\u2026' : 'Activate account' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class InviteAcceptComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  token = signal<string | null>(null);
  name = '';
  password = '';
  confirmPassword = '';
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  success = signal(false);

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token');
    this.token.set(t);
    if (!t) {
      this.errorMessage.set('Invalid or missing invitation token.');
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.token()) return;
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
        name: this.name || undefined,
      };
      const res = await firstValueFrom(
        this.http.post<LoginResponse>('/api/v1/invitations/accept', req)
      );
      localStorage.setItem('dispatch:access_token', res.access_token);
      localStorage.setItem('dispatch:refresh_token', res.refresh_token);
      this.success.set(true);
      setTimeout(() => this.router.navigate(['/dashboard']), 1500);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to accept invitation.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
