import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PageComponent } from '../../components/page/page.component';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { TenantRole } from '@dispatch/shared/domain';
import { OnboardingFormComponent, OnboardingFormValues } from '../../components/onboarding-form/onboarding-form.component';
import { BaseInputComponent } from '../../components/base-input/base-input.component';

@Component({
  selector: 'app-vendor-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    OnboardingFormComponent,
    BaseInputComponent,
  ],
  templateUrl: './vendor.onboarding.component.html',
})
export class VendorOnboardingComponent {
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  form: OnboardingFormValues = {
    fullName: '',
    email: '',
    phone: { countryCode: '+1', number: '' },
    address: '',
    notes: '',
    nationalIdFile: null,
    ntnNumber: '',
  };

  showSubmitValidation = false;
  emailError = '';
  submitMessage = '';

  async applyForApproval(): Promise<void> {
    this.showSubmitValidation = true;
    this.emailError = this.isEmailValid() ? '' : 'Enter a valid email address.';

    if (!this.isFormValid()) {
      this.submitMessage = '';
      return;
    }

    try {
      const application = await this.onboarding.submitApplication({
        role: TenantRole.Vendor,
        data: {
          fullName: this.form.fullName.trim(),
          email: this.form.email.trim(),
          phone: this.form.phone,
          address: this.form.address.trim(),
          notes: this.form.notes.trim(),
          ntnNumber: this.form.ntnNumber?.trim() ?? '',
          nationalIdFileName: this.form.nationalIdFile?.name ?? null,
        },
      });

      if (this.form.nationalIdFile) {
        await this.onboarding.uploadDocument(application.id, this.form.nationalIdFile);
      }

      await this.router.navigate(['/onboarding/pending']);
    } catch {
      this.submitMessage = 'Unable to submit your application. Please try again.';
    }
  }

  onNationalIdChange(event: Event): void {
    this.form.nationalIdFile = this.getFileFromEvent(event);
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
      !!this.form.ntnNumber?.trim() &&
      !!this.form.nationalIdFile
    );
  }

  private getFileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.[0] ?? null;
  }
}
