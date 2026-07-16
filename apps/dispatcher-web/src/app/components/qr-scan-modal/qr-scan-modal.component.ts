import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { PopupComponent } from '@components/popup/popup.component';
import { OrderActivityStatus } from '@models/orders/order-entity.model';
import { QrScannerService } from '@services/qr-scanner/qr-scanner.service';
import { ToastService } from '@core/toast/toast.service';

export interface QrScanContext {
  id: string;
  next: OrderActivityStatus;
  orderNo: string | null;
}

@Component({
  selector: 'app-qr-scan-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent],
  templateUrl: './qr-scan-modal.component.html'
})
export class QrScanModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() context: QrScanContext | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() matched = new EventEmitter<{ id: string; next: OrderActivityStatus }>();

  qrScanMatched = false;
  private qrScanSub?: Subscription;
  private qrVideoElement?: HTMLVideoElement;
  private qrMismatchToastShown = false;

  constructor(
    private readonly qrScanner: QrScannerService,
    private readonly toast: ToastService
  ) { }

  @ViewChild('qrVideo')
  set qrVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.qrVideoElement = ref?.nativeElement;
    if (this.qrVideoElement && this.open) {
      this.startQrScan(this.qrVideoElement);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['context'] && this.context) {
      this.qrScanMatched = false;
      this.qrMismatchToastShown = false;
      if (this.qrVideoElement) {
        this.startQrScan(this.qrVideoElement);
      }
    }
  }

  ngOnDestroy(): void {
    this.stopQrScan();
  }

  onClose(): void {
    this.stopQrScan();
    this.qrScanMatched = false;
    this.close.emit();
  }

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

    // Match found: stop the camera and let the user confirm via Continue rather
    // than applying the status change automatically.
    this.qrScanMatched = true;
    this.stopQrScan();
    setTimeout(() => {
      if (!this.context || !this.qrScanMatched) return;
      const { id, next } = this.context;
      this.stopQrScan();
      this.qrScanMatched = false;
      this.matched.emit({ id, next });
    }, 1000);
  }

  continueQrScan(): void {
    if (!this.context || !this.qrScanMatched) return;
    const { id, next } = this.context;
    this.stopQrScan();
    this.qrScanMatched = false;
    this.matched.emit({ id, next });
  }
}
