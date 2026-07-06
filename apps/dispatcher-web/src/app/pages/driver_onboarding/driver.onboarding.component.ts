import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PageComponent } from '@components/page/page.component';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { AuthService } from '@core/auth/auth.service';
import { OnboardingFormComponent, OnboardingFormValues } from '@components/onboarding-form/onboarding-form.component';
import { FileUploadComponent } from '@components/file-upload/file-upload.component';
import { ToastService } from '@core/toast/toast.service';
import { TenantRole } from '@dispatch/shared/domain';

@Component({
  selector: 'app-driver-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    OnboardingFormComponent,
    FileUploadComponent,
  ],
  templateUrl: './driver.onboarding.component.html',
})
export class DriverOnboardingComponent implements OnInit {
  private readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly maxUploadBytes = 10 * 1024 * 1024;

  form: OnboardingFormValues = {
    fullName: '',
    email: '',
    phone: { countryCode: '+1', number: '' },
    address: '',
    notes: '',
    passportFile: null,
    licenseFile: null,
    policeVerificationFile: null,
    drivingHistoryFile: null,
    photoIdFile: null,
  };

  showSubmitValidation = false;
  emailError = '';
  submitMessage = '';
  passportFileError = '';
  licenseFileError = '';
  policeVerificationFileError = '';
  drivingHistoryFileError = '';
  photoIdFileError = '';

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
          policeVerificationFileName: this.form.policeVerificationFile?.name ?? null,
          drivingHistoryFileName: this.form.drivingHistoryFile?.name ?? null,
          photoIdFileName: this.form.photoIdFile?.name ?? null,
        },
      });

      const uploads: Promise<void>[] = [];
      if (this.form.passportFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.passportFile));
      }
      if (this.form.licenseFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.licenseFile));
      }
      if (this.form.policeVerificationFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.policeVerificationFile));
      }
      if (this.form.drivingHistoryFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.drivingHistoryFile));
      }
      if (this.form.photoIdFile) {
        uploads.push(this.onboarding.uploadDocument(application.id, this.form.photoIdFile));
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

  onPoliceVerificationChange(event: Event): void {
    this.policeVerificationFileError = '';
    this.form.policeVerificationFile = this.getFileFromEvent(event, 'Police verification certificate', 'policeVerification');
  }

  onDrivingHistoryChange(event: Event): void {
    this.drivingHistoryFileError = '';
    this.form.drivingHistoryFile = this.getFileFromEvent(event, 'Driving history report', 'drivingHistory');
  }

  onPhotoIdChange(event: Event): void {
    this.photoIdFileError = '';
    this.form.photoIdFile = this.getFileFromEvent(event, 'Photo ID', 'photoId');
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
      !!this.form.licenseFile &&
      !!this.form.policeVerificationFile &&
      !!this.form.drivingHistoryFile &&
      !!this.form.photoIdFile
    );
  }

  private getFileFromEvent(event: Event, label: string, target: 'passport' | 'license' | 'policeVerification' | 'drivingHistory' | 'photoId'): File | null {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (file && file.size > this.maxUploadBytes) {
      if (input) {
        input.value = '';
      }
      const message = `${label}: Please select an item below 1 MB.`;
      if (target === 'passport') {
        this.passportFileError = message;
      } else if (target === 'license') {
        this.licenseFileError = message;
      } else if (target === 'policeVerification') {
        this.policeVerificationFileError = message;
      } else if (target === 'drivingHistory') {
        this.drivingHistoryFileError = message;
      } else {
        this.photoIdFileError = message;
      }
      this.toast.error(message);
      return null;
    }
    return file;
  }
}
