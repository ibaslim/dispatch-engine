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
  @Input() layout: 'card' | 'row' = 'card';
  @Input() name = '';

  @Input() fileName: string | null = null;
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
}