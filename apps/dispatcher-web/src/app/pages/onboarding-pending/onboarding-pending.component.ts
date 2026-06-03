import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonComponent } from '../../components/button/button.component';
import { PageComponent } from '../../components/page/page.component';
import { OnboardingService } from '../../core/onboarding/onboarding.service';

@Component({
  selector: 'app-onboarding-pending',
  standalone: true,
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './onboarding-pending.component.html',
})
export class OnboardingPendingComponent {
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  statusMessage = 'Your application is pending approval.';
  isChecking = false;

  async refreshStatus(): Promise<void> {
    this.isChecking = true;
    const application = await this.onboarding.loadMyApplication();
    if (application?.status === 'approved') {
      await this.router.navigate(['/orders']);
    } else if (application?.status === 'rejected') {
      this.statusMessage = 'Your application was rejected. Please contact an admin.';
    }
    this.isChecking = false;
  }
}

