import { CommonModule, Location } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AddressInputComponent } from '@components/address-input/address-input.component';
import { BaseInputComponent } from '@components/base-input/base-input.component';
import { ButtonComponent } from '@components/button/button.component';
import { PhoneInputComponent } from '@components/phone-input/phone-input.component';
import { TextareaComponent } from '@components/textarea/textarea.component';
import { PhoneValue } from '@models/phone-input/phone-input.model';
import { TenantRole } from '@dispatch/shared/domain';

export interface OnboardingFormValues {
  fullName: string;
  email: string;
  phone: PhoneValue;
  address: string;
  notes: string;
  ntnNumber?: string;
  businessNumber?: string;
  passportFile?: File | null;
  licenseFile?: File | null;
  nationalIdFile?: File | null;
  policeVerificationFile?: File | null;
  drivingHistoryFile?: File | null;
  photoIdFile?: File | null;
  profilePictureFile?: File | null;
}

@Component({
  selector: 'app-onboarding-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseInputComponent,
    PhoneInputComponent,
    AddressInputComponent,
    TextareaComponent,
    ButtonComponent,
  ],
  template: `
    <div
        class="w-full max-w-[860px] mx-auto rounded-2xl border border-gray-200 dark:border-[#2a2d2a] bg-white dark:bg-[#1E201E] p-6 sm:p-10 shadow-sm">
      <div class="mb-8">
        <h2 class="text-xl sm:text-[22px] font-bold text-gray-900 dark:text-gray-100">{{ title }}</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ subtitle }}</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-7">
        <app-base-input
            label="Full Name"
            [required]="true"
            [value]="form.fullName"
            (valueChange)="onValueChange('fullName', $event)">
        </app-base-input>

        <app-base-input
            label="Email"
            type="email"
            [required]="true"
            [value]="form.email"
            [disabled]="true"
            [externalError]="emailError"
            [showSubmitValidation]="showSubmitValidation"
            (valueChange)="onValueChange('email', $event)">
        </app-base-input>

        <app-phone-input
            label="Phone Number"
            [required]="true"
            [value]="form.phone"
            [showSubmitValidation]="showSubmitValidation"
            (valueChange)="onValueChange('phone', $event)">
        </app-phone-input>

        <app-address-input
            label="Address"
            [required]="true"
            [value]="form.address"
            [showSubmitValidation]="showSubmitValidation"
            (valueChange)="onValueChange('address', $event)">
        </app-address-input>

        <div class="md:col-span-2 h-px bg-gray-200 dark:bg-[#2a2d2a] my-1"></div>

        <!-- Role-specific fields using Content Projection -->
        <ng-content></ng-content>

        <div class="md:col-span-2">
          <app-textarea
              label="Additional Notes"
              [placeholder]="notesPlaceholder"
              [value]="form.notes"
              (valueChange)="onValueChange('notes', $event)">
          </app-textarea>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-end gap-3 sm:gap-5 mt-8">

        <app-button
            variant="ghost"
            label="Cancel"
            (click)="onCancelClick()"
            [extraClasses]="'w-full sm:inline-flex items-center align-center px-7 py-3 rounded-md text-sm font-bold outline outline-1 outline-gray-300 dark:outline-gray-600'">
        </app-button>

        <app-button
            variant="primary"
            label="Proceed"
            (onClick)="onSubmit.emit()"
            [extraClasses]="'w-full sm:inline-flex items-center align-center gap-2 px-7 py-2.5 rounded-md text-sm font-bold'">
          <i data-trailing-icon class="ph ph-arrow-right text-base"></i>
        </app-button>

        <p *ngIf="submitMessage" class="text-sm" [ngClass]="submitMessageClass">
          {{ submitMessage }}
        </p>
      </div>
    </div>
  `,
})
export class OnboardingFormComponent {
  private readonly location = inject(Location);

  @Input() form!: OnboardingFormValues;
  @Input() role!: TenantRole;
  @Input() title = 'Registration';
  @Input() subtitle = 'Fill in your information and upload the required documents to complete your registration.';
  @Input() showSubmitValidation = false;
  @Input() emailError = '';
  @Input() submitMessage = '';
  @Input() submitMessageClass = 'text-green-700 dark:text-green-400';
  @Input() notesPlaceholder = 'Optional details';
  @Input() showCancel = true;

  @Output() formChange = new EventEmitter<OnboardingFormValues>();
  @Output() onSubmit = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  onValueChange(key: keyof OnboardingFormValues, value: any): void {
    this.form = { ...this.form, [key]: value };
    this.formChange.emit(this.form);
  }

  onCancelClick(): void {
    this.onCancel.emit();
    this.location.back();
  }
}