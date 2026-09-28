import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ErrorMessageComponent } from '../error-message/error-message.component';

@Component({
  selector: 'app-password-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ErrorMessageComponent],
  templateUrl: './password-input.component.html',
  styles: [`:host { display: block; }`],
})
export class PasswordInputComponent {
  @Input() label = 'Password';
  @Input() placeholder = '';
  @Input() value = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() showLabel = true;

  @Input() name = '';
  @Input() autocomplete: 'current-password' | 'new-password' = 'current-password';
  @Input() minlength?: number;

  @Input() errorMessages: { [key: string]: string } = {};
  @Input() externalError = '';
  @Input() showSubmitValidation = false;

  @Output() valueChange = new EventEmitter<string>();

  visible = false;
  private interacted = false;

  onInputValue(v: string): void {
    this.interacted = true;
    this.value = v;
    this.valueChange.emit(v);
  }

  toggleVisibility(): void {
    this.visible = !this.visible;
  }

  getName(): string {
    return this.name || this.label?.replace(/\s+/g, '_').toLowerCase() || 'password';
  }

  get showError(): boolean {
    if (!this.interacted && !this.showSubmitValidation) return false;

    const requiredError = this.required && !this.value;
    const minLengthError = !!this.minlength && !!this.value && this.value.length < this.minlength;

    return requiredError || minLengthError || !!this.externalError;
  }

  get errorList(): string[] {
    const list: string[] = [];

    if (!this.interacted && !this.showSubmitValidation) return list;

    if (this.required && !this.value) {
      list.push(this.errorMessages['required'] || 'This field is required.');
    }

    if (this.minlength && this.value && this.value.length < this.minlength) {
      list.push(
        this.errorMessages['minlength'] || `Must be at least ${this.minlength} characters.`
      );
    }

    if (this.externalError) {
      list.push(this.externalError);
    }

    return list;
  }
}
