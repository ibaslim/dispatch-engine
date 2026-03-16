import { Component } from '@angular/core';

@Component({
  selector: 'app-not-found',
  standalone: true,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="text-center">
        <h1 class="text-6xl font-bold text-gray-300">404</h1>
        <p class="mt-4 text-gray-600">Tracking link not found.</p>
      </div>
    </div>
  `,
})
export class NotFoundComponent {}
