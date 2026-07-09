import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ErrorMessageComponent } from '../error-message/error-message.component';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, ErrorMessageComponent],
  templateUrl: './file-upload.component.html',
})
export class FileUploadComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() icon = 'ph-upload-simple';
  @Input() accept = 'image/*,application/pdf';
  @Input() required = false;
  @Input() accent = false;
  @Input() layout: 'card' | 'row' | 'circle' = 'card';
  @Input() name = '';

  @Input() fileName: string | null = null;
  @Input() previewUrl: string | null = null;
  @Input() error = '';
  @Input() showSubmitValidation = false;
  @Input() missingMessage = '';

  @Output() fileChange = new EventEmitter<Event>();

  get inputId(): string {
    return `file-upload-${(this.name || this.label).replace(/\s+/g, '-').toLowerCase()}`;
  }

  onChange(event: Event): void {
    this.fileChange.emit(event);
  }

  get showMissingError(): boolean {
    return this.showSubmitValidation && !this.fileName && !this.error && !!this.missingMessage;
  }

  get errorList(): string[] {
    return [this.error, this.showMissingError ? this.missingMessage : ''].filter(Boolean);
  }

  /** A file is chosen and passed validation (no error message). */
  get isValid(): boolean {
    return !!this.fileName && this.errorList.length === 0;
  }

  /** A file was selected but rejected, or a required file is missing after submit. */
  get isInvalid(): boolean {
    return this.errorList.length > 0;
  }

  /** Outline colour: green when valid, red when invalid, grey otherwise. */
  get borderClass(): string {
    if (this.isInvalid) {
      return 'border-red-500 dark:border-red-500';
    }
    if (this.isValid) {
      return 'border-green-500 dark:border-green-500';
    }
    return this.accent
      ? 'border-indigo-200 dark:border-indigo-500/30'
      : 'border-gray-300 dark:border-[#3a3d3a]';
  }
}