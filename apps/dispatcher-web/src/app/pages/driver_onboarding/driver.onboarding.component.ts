import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PageComponent } from '../../components/page/page.component';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { AuthService } from '../../core/auth/auth.service';
import { TenantRole } from '@dispatch/shared/domain';
import { OnboardingFormComponent, OnboardingFormValues } from '../../components/onboarding-form/onboarding-form.component';
import { BaseInputComponent } from '../../components/base-input/base-input.component';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-driver-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    OnboardingFormComponent,
    BaseInputComponent,
  ],
  templateUrl: './driver.onboarding.component.html',
})
export class DriverOnboardingComponent implements OnInit {
  private readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly maxUploadBytes = 1024 * 1024;

  form: OnboardingFormValues = {
    fullName: '',
    email: '',
    phone: { countryCode: '+1', number: '' },
    address: '',
    notes: '',
    passportFile: null,
    licenseFile: null,
  };

  showSubmitValidation = false;
  emailError = '';
  submitMessage = '';
  passportFileError = '';
  licenseFileError = '';

  async ngOnInit(): Promise<void> {
    if (!this.auth.currentUser()) {
      await this.auth.loadCurrentUser();
    }
    const user = this.auth.currentUser();
    if (user) {
      this.form.email = user.email;
      this.form.fullName = user.name || '';
    }
  }

  async applyForApproval(): Promise<void> {
    this.showSubmitValidation = true;
    this.emailError = this.isEmailValid() ? '' : 'Enter a valid email address.';

    if (!this.isFormValid()) {
      this.submitMessage = '';
      return;
    }

    try {
      const application = await this.onboarding.submitApplication({
        role: TenantRole.Driver,
        data: {
          fullName: this.form.fullName.trim(),
          email: this.form.email.trim(),
          phone: this.form.phone,
          address: this.form.address.trim(),
          notes: this.form.notes.trim(),
          passportFileName: this.form.passportFile?.name ?? null,
          licenseFileName: this.form.licenseFile?.name ?? null,
        },
      });

      const uploads: Promise<void>[] = [];
      if (this.form.passportFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.passportFile));
      }
      if (this.form.licenseFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.licenseFile));
      }
      if (uploads.length) {
        await Promise.all(uploads);
      }

      await this.router.navigate(['/onboarding/pending']);
    } catch {
      this.submitMessage = 'Unable to submit your application. Please try again.';
    }
  }

  onPassportChange(event: Event): void {
    this.passportFileError = '';
    this.form.passportFile = this.getFileFromEvent(event, 'Passport scan', 'passport');
  }

  onLicenseChange(event: Event): void {
    this.licenseFileError = '';
    this.form.licenseFile = this.getFileFromEvent(event, 'Driving license scan', 'license');
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
      !!this.form.passportFile &&
      !!this.form.licenseFile
    );
  }

  private getFileFromEvent(event: Event, label: string, target: 'passport' | 'license'): File | null {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (file && file.size > this.maxUploadBytes) {
      if (input) {
        input.value = '';
      }
      const message = `${label}: Please select an item below 1 MB.`;
      if (target === 'passport') {
        this.passportFileError = message;
      } else {
        this.licenseFileError = message;
      }
      this.toast.error(message);
      return null;
    }
    return file;
  }
}
