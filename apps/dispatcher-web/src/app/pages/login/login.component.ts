import { Component, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PasswordInputComponent } from '../../components/password-input/password-input.component';
import { BaseInputComponent } from '../../components/base-input/base-input.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, PasswordInputComponent, BaseInputComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-md">
        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Dispatch Engine
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <form class="mt-8 space-y-6" (ngSubmit)="onSubmit()">
          @if (errorMessage()) {
            <div class="rounded-md bg-red-50 p-4">
              <p class="text-sm text-red-800">{{ errorMessage() }}</p>
            </div>
          }

          <div class="space-y-4">
            <div>
              <app-base-input
                label="Email address"
                type="email"
                name="email"
                placeholder="you@example.com"
                [required]="true"
                [value]="email"
                (valueChange)="email = $event">
              </app-base-input>
            </div>

            <div>
              <app-password-input
                label="Password"
                name="password"
                autocomplete="current-password"
                [required]="true"
                [value]="password"
                (valueChange)="password = $event">
              </app-password-input>
            </div>
          </div>

          <div>
            <button
              type="submit"
              [disabled]="isLoading()"
              class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isLoading() ? 'Signing in...' : 'Sign in' }}
            </button>
          </div>
          
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);

  email = '';
  password = '';
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.login(this.email, this.password);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Login failed. Please try again.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
