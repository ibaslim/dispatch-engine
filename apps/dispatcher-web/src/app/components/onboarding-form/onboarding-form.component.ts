import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AddressInputComponent } from '../address-input/address-input.component';
import { BaseInputComponent } from '../base-input/base-input.component';
import { ButtonComponent } from '../button/button.component';
import { PhoneInputComponent } from '../phone-input/phone-input.component';
import { TextareaComponent } from '../textarea/textarea.component';
import { PhoneValue } from '../../models/phone-input/phone-input.model';
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
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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

    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6">
      <p *ngIf="submitMessage" class="text-sm" [ngClass]="submitMessageClass">
        {{ submitMessage }}
      </p>

      <app-button
        variant="primary"
        label="Proceed"
        (onClick)="onSubmit.emit()"
        [extraClasses]="'px-6 py-2 rounded-md text-sm'">
      </app-button>
    </div>
  `,
})
export class OnboardingFormComponent {
  @Input() form!: OnboardingFormValues;
  @Input() role!: TenantRole;
  @Input() showSubmitValidation = false;
  @Input() emailError = '';
  @Input() submitMessage = '';
  @Input() submitMessageClass = 'text-green-700 dark:text-green-400';
  @Input() notesPlaceholder = 'Optional details';

  @Output() formChange = new EventEmitter<OnboardingFormValues>();
  @Output() onSubmit = new EventEmitter<void>();

  onValueChange(key: keyof OnboardingFormValues, value: any): void {
    this.form = { ...this.form, [key]: value };
    this.formChange.emit(this.form);
  }
}
