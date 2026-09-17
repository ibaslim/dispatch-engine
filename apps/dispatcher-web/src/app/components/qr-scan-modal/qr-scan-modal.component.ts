import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { OrderActivityStatus } from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { QrScannerService } from '@services/qr-scanner/qr-scanner.service';
import { ToastService } from '@core/toast/toast.service';

export interface QrScanContext {
  id: string;
  next: OrderActivityStatus;
  orderNo: string | null;
}

/** Scanning the label, or photographing the parcel when there is no label. */
type VerifyMode = 'scan' | 'photo';

const NOTE_MAX_LENGTH = 280;

@Component({
  selector: 'app-qr-scan-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent, ButtonComponent],
  templateUrl: './qr-scan-modal.component.html'
})
export class QrScanModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() context: QrScanContext | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() matched = new EventEmitter<{ id: string; next: OrderActivityStatus }>();

  mode: VerifyMode = 'scan';
  qrScanMatched = false;
  verifying = false;

  photoTaken = false;
  photoPreviewUrl: string | null = null;
  photoNote = '';
  readonly noteMaxLength = NOTE_MAX_LENGTH;

  private qrScanSub?: Subscription;
  private qrVideoElement?: HTMLVideoElement;
  private qrMismatchToastShown = false;
  private lastScannedCode = '';

  private photoStream?: MediaStream;
  private photoVideoElement?: HTMLVideoElement;
  private photoBlob: Blob | null = null;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly qrScanner: QrScannerService,
    private readonly toast: ToastService
  ) { }

  @ViewChild('qrVideo')
  set qrVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.qrVideoElement = ref?.nativeElement;
    if (this.qrVideoElement && this.open && this.mode === 'scan') {
      this.startQrScan(this.qrVideoElement);
    }
  }

  @ViewChild('parcelVideo')
  set parcelVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.photoVideoElement = ref?.nativeElement;
    if (this.photoVideoElement && this.open && this.mode === 'photo' && !this.photoTaken) {
      this.startPhotoCamera(this.photoVideoElement);
    }
  }

  get popupTitle(): string {
    return this.mode === 'scan' ? 'Verify parcel' : 'Photograph parcel';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['context'] && this.context) {
      this.resetState();
      if (this.qrVideoElement) {
        this.startQrScan(this.qrVideoElement);
      }
    }
  }

  ngOnDestroy(): void {
    this.stopQrScan();
    this.stopPhotoCamera();
    this.clearPhotoPreview();
  }

  onClose(): void {
    this.stopQrScan();
    this.stopPhotoCamera();
    this.clearPhotoPreview();
    this.resetState();
    this.close.emit();
  }

  private resetState(): void {
    this.mode = 'scan';
    this.qrScanMatched = false;
    this.qrMismatchToastShown = false;
    this.verifying = false;
    this.photoTaken = false;
    this.photoNote = '';
    this.photoBlob = null;
    this.lastScannedCode = '';
  }

  // ─── QR scanning ───────────────────────────────────────────────────────────

  private startQrScan(video: HTMLVideoElement): void {
    this.stopQrScan();
    this.qrScanSub = this.qrScanner.start(video).subscribe({
      next: (text) => this.onQrDecoded(text),
      error: () => this.toast.error('Camera unavailable. Check camera permissions and try again.')
    });
  }

  private stopQrScan(): void {
    this.qrScanSub?.unsubscribe();
    this.qrScanSub = undefined;
    this.qrScanner.stop();
  }

  private onQrDecoded(text: string): void {
    if (!this.context || this.qrScanMatched) return;

    const scanned = text.trim();
    if (this.context.orderNo && scanned !== this.context.orderNo) {
      if (!this.qrMismatchToastShown) {
        this.qrMismatchToastShown = true;
        this.toast.error(`Scanned code doesn't match this order (expected ${this.context.orderNo}).`);
      }
      return;
    }

    // Match found: stop the camera and let the confirmation show for a beat
    // before the status change is applied.
    this.qrScanMatched = true;
    this.lastScannedCode = scanned;
    this.stopQrScan();
    setTimeout(() => {
      if (!this.context || !this.qrScanMatched) return;
      this.recordQrVerification(scanned);
    }, 1000);
  }

  private recordQrVerification(code: string): void {
    if (!this.context || this.verifying) return;
    const { id, next } = this.context;
    this.verifying = true;

    this.ordersService.verifyPickupByQr(id, code).subscribe({
      next: () => {
        this.verifying = false;
        this.qrScanMatched = false;
        this.matched.emit({ id, next });
      },
      error: () => {
        this.verifying = false;
        this.qrScanMatched = false;
        this.toast.error('Unable to verify the parcel. Please try again.');
        if (this.qrVideoElement) {
          this.startQrScan(this.qrVideoElement);
        }
      }
    });
  }

  continueQrScan(): void {
    if (!this.context || !this.qrScanMatched) return;
    this.stopQrScan();
    this.recordQrVerification(this.lastScannedCode);
  }

  // ─── Parcel photo fallback ─────────────────────────────────────────────────

  usePhotoInstead(): void {
    this.stopQrScan();
    this.qrScanMatched = false;
    this.mode = 'photo';
  }

  backToScanning(): void {
    this.stopPhotoCamera();
    this.clearPhotoPreview();
    this.photoTaken = false;
    this.photoBlob = null;
    this.mode = 'scan';
    if (this.qrVideoElement) {
      this.startQrScan(this.qrVideoElement);
    }
  }

  private async startPhotoCamera(video: HTMLVideoElement): Promise<void> {
    this.stopPhotoCamera();
    try {
      this.photoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = this.photoStream;
      await video.play();
    } catch {
      this.toast.error('Camera unavailable. Check camera permissions and try again.');
    }
  }

  private stopPhotoCamera(): void {
    this.photoStream?.getTracks().forEach((track) => track.stop());
    this.photoStream = undefined;
    if (this.photoVideoElement) {
      this.photoVideoElement.srcObject = null;
    }
  }

  private clearPhotoPreview(): void {
    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
      this.photoPreviewUrl = null;
    }
  }

  takeParcelPhoto(): void {
    const video = this.photoVideoElement;
    if (!video || !this.context) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      this.clearPhotoPreview();
      this.photoBlob = blob;
      this.photoPreviewUrl = URL.createObjectURL(blob);
      this.photoTaken = true;
      this.stopPhotoCamera();
    }, 'image/jpeg', 0.9);
  }

  retakeParcelPhoto(): void {
    this.clearPhotoPreview();
    this.photoBlob = null;
    this.photoTaken = false;
    if (this.photoVideoElement) {
      this.startPhotoCamera(this.photoVideoElement);
    }
  }

  confirmParcelPhoto(): void {
    if (!this.context || !this.photoBlob || this.verifying) return;
    const { id, next } = this.context;
    this.verifying = true;

    this.ordersService.verifyPickupByPhoto(id, this.photoBlob, this.photoNote.trim()).subscribe({
      next: () => {
        this.verifying = false;
        this.matched.emit({ id, next });
      },
      error: () => {
        this.verifying = false;
        this.toast.error('Unable to upload the photo. Please try again.');
      }
    });
  }
}
