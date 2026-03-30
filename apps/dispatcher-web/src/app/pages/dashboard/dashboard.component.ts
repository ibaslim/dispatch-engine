import { Component, OnInit, inject } from '@angular/core';

import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NavbarComponent } from '../../components/navbar/navbar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NavbarComponent],
  template: `
  <div>
    <app-navbar></app-navbar>

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div class="bg-white overflow-hidden shadow rounded-lg p-6">
            <h3 class="text-base font-medium text-gray-900">Active Orders</h3>
            <p class="mt-2 text-3xl font-bold text-primary-600">&ndash;</p>
          </div>
          <div class="bg-white overflow-hidden shadow rounded-lg p-6">
            <h3 class="text-base font-medium text-gray-900">Available Drivers</h3>
            <p class="mt-2 text-3xl font-bold text-primary-600">&ndash;</p>
          </div>
          <div class="bg-white overflow-hidden shadow rounded-lg p-6">
            <h3 class="text-base font-medium text-gray-900">Completed Today</h3>
            <p class="mt-2 text-3xl font-bold text-primary-600">&ndash;</p>
          </div>
        </div>
        <p class="mt-8 text-center text-gray-400 text-sm">
          Dashboard content coming soon &ndash; auth scaffold complete.
        </p>
        <p class="mt-2 text-center text-sm">
          <a routerLink="/posts" class="text-primary-600 hover:text-primary-500">
            Open posts listing demo
          </a>
        </p>
      </main>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.auth.loadCurrentUser();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
