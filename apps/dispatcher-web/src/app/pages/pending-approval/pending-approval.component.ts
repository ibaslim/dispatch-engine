import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg text-center">
        <div class="space-y-4">
          <div class="flex justify-center mb-4">
            <div class="text-5xl">⏳</div>
          </div>
          
          <h2 class="text-3xl font-bold text-gray-900">
            Waiting for Approval
          </h2>
          
          <p class="text-gray-600 text-base leading-relaxed">
            Your account has been created successfully. An administrator will review your request and approve it shortly.
          </p>
          
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <p class="text-sm text-blue-800">
              <strong>What's next?</strong> Once approved, you'll be able to log in and access the platform. We'll send you a notification when you're ready to go.
            </p>
          </div>
        </div>

        <div class="pt-4">
          <button
            (click)="goToLogin()"
            class="w-full py-2 px-4 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-900 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PendingApprovalComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    // Auto-refresh or check approval status periodically (optional)
    // For now, just show the waiting screen
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}

