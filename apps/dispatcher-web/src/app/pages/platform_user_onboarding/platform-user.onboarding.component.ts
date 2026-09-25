import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageComponent } from '@components/page/page.component';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { AuthService } from '@core/auth/auth.service';
import { PlatformRole } from '@dispatch/shared/domain';
import { OnboardingFormComponent, OnboardingFormValues } from '@components/onboarding-form/onboarding-form.component';
import { FileUploadComponent } from '@components/file-upload/file-upload.component';
import { ToastService } from '@core/toast/toast.service';

const ROLE_TITLES: Record<string, string> = {
  [PlatformRole.OperationalAdmin]: 'Operational Admin Registration',
  [PlatformRole.AccountsAdmin]: 'Accounts Admin Registration',
};

@Component({
  selector: 'app-platform-user-onboarding',
  standalone: true,
  imports: [CommonModule, PageComponent, OnboardingFormComponent, FileUploadComponent],
  templateUrl: './platform-user.onboarding.component.html',
})
export class PlatformUserOnboardingComponent implements OnInit {
  private readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  private readonly maxUploadBytes = 10 * 1024 * 1024;

  role = PlatformRole.OperationalAdmin as string;
  title = 'Admin Registration';

  form: OnboardingFormValues = {
    fullName: '',
    email: '',
    phone: { countryCode: '+1', number: '' },
    address: '',
    notes: '',
    governmentIdFile: null,
  };

  private applicationId: string | null = null;

  showSubmitValidation = false;
  emailError = '';
  submitMessage = '';
  governmentIdFileError = '';

  async ngOnInit(): Promise<void> {
    this.role = (this.route.snapshot.data['role'] as string) || this.role;
    this.title = ROLE_TITLES[this.role] || this.title;

    if (!this.auth.currentUser()) {
      await this.auth.loadCurrentUser();
    }
    const user = this.auth.currentUser();
    if (user) {
      this.form.email = user.email;
      this.form.fullName = user.name || '';
    }

    const application = await this.onboarding.loadMyApplication();
    if (application) {
      this.applicationId = application.id;
    } else {
      this.submitMessage = 'No pending invitation found for this account. Please use the link from your invitation email.';
    }
  }

  async applyForApproval(): Promise<void> {
    this.showSubmitValidation = true;
    this.emailError = this.isEmailValid() ? '' : 'Enter a valid email address.';

    if (!this.applicationId) {
      this.submitMessage = 'No pending invitation found for this account.';
      return;
    }

    if (!this.isFormValid()) {
      this.submitMessage = '';
      return;
    }

    try {
      await this.onboarding.uploadDocument(
        this.applicationId,
        this.form.governmentIdFile as File,
        'government_id'
      );

      await this.onboarding.submitApplication({
        role: this.role,
        data: {
          fullName: this.form.fullName.trim(),
          email: this.form.email.trim(),
          phone: this.form.phone,
          address: this.form.address.trim(),
          notes: this.form.notes.trim(),
          documents: {
            government_id: this.form.governmentIdFile?.name,
          },
        },
      });

      await this.router.navigate(['/onboarding/pending']);
    } catch {
      this.submitMessage = 'Unable to submit your application. Please try again.';
    }
  }

  onGovernmentIdChange(event: Event): void {
    this.governmentIdFileError = '';
    this.form.governmentIdFile = this.getFileFromEvent(event, 'Government-issued ID');
  }

  private isEmailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim());
  }

  private isFormValid(): boolean {
    return (
      !!this.form.fullName.trim() &&
      this.isEmailValid() &&
      !!this.form.phone.number &&
      !!this.form.address.trim() &&
      !!this.form.governmentIdFile
    );
  }

  private getFileFromEvent(event: Event, label: string): File | null {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (file && file.size > this.maxUploadBytes) {
      if (input) {
        input.value = '';
      }
      const message = `${label}: Please select an item below 10 MB.`;
      this.toast.error(message);
      return null;
    }
    return file;
  }
}
