import { Component, OnInit, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { InviteTenantAdminRequest } from '@dispatch/shared/contracts';

@Component({
  selector: 'app-platform-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 class="text-xl font-semibold text-gray-900">Platform Administration</h1>
          <button
            (click)="logout()"
            class="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="bg-white rounded-xl shadow-md p-6 max-w-lg">
          <h2 class="text-lg font-medium text-gray-900 mb-6">
            Invite Tenant Administrator
          </h2>

          @if (successMessage()) {
            <div class="rounded-md bg-green-50 p-4 mb-4">
              <p class="text-sm text-green-800">{{ successMessage() }}</p>
            </div>
          }

          @if (errorMessage()) {
            <div class="rounded-md bg-red-50 p-4 mb-4">
              <p class="text-sm text-red-800">{{ errorMessage() }}</p>
            </div>
          }

          <form (ngSubmit)="onInvite()" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Tenant name</label>
              <input
                type="text"
                required
                [(ngModel)]="tenantName"
                name="tenantName"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Acme Deliveries"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Admin name</label>
              <input
                type="text"
                required
                [(ngModel)]="adminName"
                name="adminName"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Admin email</label>
              <input
                type="email"
                required
                [(ngModel)]="adminEmail"
                name="adminEmail"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="admin@tenant.com"
              />
            </div>
            <button
              type="submit"
              [disabled]="isLoading()"
              class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {{ isLoading() ? 'Sending invite\u2026' : 'Send invitation' }}
            </button>
          </form>
        </div>
      </main>
    </div>
  `,
})
export class PlatformAdminComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  tenantName = '';
  adminName = '';
  adminEmail = '';
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.auth.isPlatformAdmin()) {
      this.router.navigate(['/dashboard']);
    }
  }

  async onInvite(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const req: InviteTenantAdminRequest = {
        email: this.adminEmail,
        name: this.adminName,
        tenant_name: this.tenantName,
      };
      await firstValueFrom(
        this.http.post('/api/v1/platform/tenants/invite', req)
      );
      this.successMessage.set(`Invitation sent to ${this.adminEmail}`);
      this.tenantName = '';
      this.adminName = '';
      this.adminEmail = '';
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to send invitation.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
