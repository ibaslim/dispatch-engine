import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AddressInputComponent } from '../../components/address-input/address-input.component';
import { BaseInputComponent } from '../../components/base-input/base-input.component';
import { ButtonComponent } from '../../components/button/button.component';
import { PageComponent } from '../../components/page/page.component';
import { PhoneInputComponent } from '../../components/phone-input/phone-input.component';
import { TextareaComponent } from '../../components/textarea/textarea.component';
import { PhoneValue } from '../../models/phone-input/phone-input.model';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { TenantRole } from '@dispatch/shared/domain';

interface DriverOnboardingForm {
  fullName: string;
  email: string;
  phone: PhoneValue;
  address: string;
  notes: string;
  passportFile: File | null;
  licenseFile: File | null;
}

@Component({
  selector: 'app-driver-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageComponent,
    BaseInputComponent,
    PhoneInputComponent,
    AddressInputComponent,
    TextareaComponent,
    ButtonComponent,
  ],
  templateUrl: './driver.onboarding.component.html',
})
export class DriverOnboardingComponent {
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  form: DriverOnboardingForm = {
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
    this.form.passportFile = this.getFileFromEvent(event);
  }

  onLicenseChange(event: Event): void {
    this.form.licenseFile = this.getFileFromEvent(event);
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

  private getFileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.[0] ?? null;
  }
}
