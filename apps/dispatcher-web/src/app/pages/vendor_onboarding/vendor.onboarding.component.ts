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
export class VendorOnboardingComponent implements OnInit {
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
    nationalIdFile: null,
    businessNumber: '',
  };

  showSubmitValidation = false;
  emailError = '';
  submitMessage = '';
  nationalIdFileError = '';

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
        role: TenantRole.Vendor,
        data: {
          fullName: this.form.fullName.trim(),
          email: this.form.email.trim(),
          phone: this.form.phone,
          address: this.form.address.trim(),
          notes: this.form.notes.trim(),
          businessNumber: this.form.businessNumber?.trim() ?? '',
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
    this.nationalIdFileError = '';
    this.form.nationalIdFile = this.getFileFromEvent(event, 'National identity scan');
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
      this.isBusinessNumberValid() &&
      !!this.form.nationalIdFile
    );
  }

  private isBusinessNumberValid(): boolean {
    const value = (this.form.businessNumber || '').trim();
    return /^[A-Za-z0-9]{15}$/.test(value);
  }

  private getFileFromEvent(event: Event, label: string): File | null {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (file && file.size > this.maxUploadBytes) {
      if (input) {
        input.value = '';
      }
      const message = `${label}: Please select an item below 1 MB.`;
      this.nationalIdFileError = message;
      this.toast.error(message);
      return null;
    }
    return file;
  }
}
