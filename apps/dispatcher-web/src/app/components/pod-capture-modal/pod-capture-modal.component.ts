import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { OrderActivityStatus } from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { ToastService } from '@core/toast/toast.service';

export interface PodCaptureContext {
  id: string;
  next: OrderActivityStatus;
  orderNo: string | null;
  signatureRequired: boolean;
}

@Component({
  selector: 'app-pod-capture-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, PopupComponent, ButtonComponent],
  templateUrl: './pod-capture-modal.component.html'
})
export class PodCaptureModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() context: PodCaptureContext | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() delivered = new EventEmitter<{ id: string; next: OrderActivityStatus }>();

  podPhotoDone = false;
  podPhotoUploading = false;
  podPhotoPreviewUrl: string | null = null;
  private podStream?: MediaStream;
  private podVideoElement?: HTMLVideoElement;

  podSignatureDone = false;
  podSignatureUploading = false;
  podSignatureHasDrawing = false;
  podRecipientName = '';
  private podSignatureCanvasElement?: HTMLCanvasElement;
  private podSignatureCtx?: CanvasRenderingContext2D;
  private podSignatureDrawing = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly toast: ToastService
  ) { }

  @ViewChild('podVideo')
  set podVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.podVideoElement = ref?.nativeElement;
    if (this.podVideoElement && this.open && !this.podPhotoDone) {
      this.startPodCamera(this.podVideoElement);
    }
  }

  @ViewChild('podSignatureCanvas')
  set podSignatureCanvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.podSignatureCanvasElement = ref?.nativeElement;
    if (this.podSignatureCanvasElement) {
      this.podSignatureCtx = this.podSignatureCanvasElement.getContext('2d') ?? undefined;
      this.clearPodSignature();
    }
  }

  get podSignatureRequired(): boolean {
    return !!this.context?.signatureRequired;
  }

  get podCanMarkDelivered(): boolean {
    return this.podPhotoDone && (!this.podSignatureRequired || this.podSignatureDone);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['context'] && this.context) {
      this.podPhotoDone = false;
      this.podPhotoUploading = false;
      this.podPhotoPreviewUrl = null;
      this.podSignatureDone = false;
      this.podSignatureUploading = false;
      this.podSignatureHasDrawing = false;
      this.podRecipientName = '';

      if (this.podVideoElement) {
        this.startPodCamera(this.podVideoElement);
      }
    }
  }

  ngOnDestroy(): void {
    this.stopPodCamera();
  }

  onClose(): void {
    this.stopPodCamera();
    if (this.podPhotoPreviewUrl) {
      URL.revokeObjectURL(this.podPhotoPreviewUrl);
      this.podPhotoPreviewUrl = null;
    }
    this.close.emit();
  }

  private async startPodCamera(video: HTMLVideoElement): Promise<void> {
    this.stopPodCamera();
    try {
      this.podStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = this.podStream;
      await video.play();
    } catch {
      this.toast.error('Camera unavailable. Check camera permissions and try again.');
    }
  }

  private stopPodCamera(): void {
    this.podStream?.getTracks().forEach((track) => track.stop());
    this.podStream = undefined;
    if (this.podVideoElement) {
      this.podVideoElement.srcObject = null;
    }
  }

  capturePodPhoto(): void {
    if (!this.podVideoElement || !this.context) return;
    const video = this.podVideoElement;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob || !this.context) return;
      this.podPhotoUploading = true;
      this.ordersService.uploadDeliveryPhoto(this.context.id, blob).subscribe({
        next: () => {
          this.podPhotoUploading = false;
          this.podPhotoDone = true;
          this.podPhotoPreviewUrl = URL.createObjectURL(blob);
          this.stopPodCamera();
        },
        error: () => {
          this.podPhotoUploading = false;
          this.toast.error('Unable to upload photo. Please try again.');
        }
      });
    }, 'image/jpeg', 0.9);
  }

  retakePodPhoto(): void {
    this.podPhotoDone = false;
    if (this.podPhotoPreviewUrl) {
      URL.revokeObjectURL(this.podPhotoPreviewUrl);
      this.podPhotoPreviewUrl = null;
    }
    if (this.podVideoElement) {
      this.startPodCamera(this.podVideoElement);
    }
  }

  onSignaturePointerDown(event: PointerEvent): void {
    if (!this.podSignatureCtx || !this.podSignatureCanvasElement) return;
    this.podSignatureDrawing = true;
    const { x, y } = this.podSignaturePoint(event);
    this.podSignatureCtx.beginPath();
    this.podSignatureCtx.moveTo(x, y);
  }

  onSignaturePointerMove(event: PointerEvent): void {
    if (!this.podSignatureDrawing || !this.podSignatureCtx) return;
    const { x, y } = this.podSignaturePoint(event);
    this.podSignatureCtx.strokeStyle = '#111827';
    this.podSignatureCtx.lineWidth = 2;
    this.podSignatureCtx.lineCap = 'round';
    this.podSignatureCtx.lineTo(x, y);
    this.podSignatureCtx.stroke();
    this.podSignatureHasDrawing = true;
  }

  onSignaturePointerUp(): void {
    this.podSignatureDrawing = false;
  }

  private podSignaturePoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.podSignatureCanvasElement!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  clearPodSignature(): void {
    if (!this.podSignatureCtx || !this.podSignatureCanvasElement) return;
    this.podSignatureCtx.fillStyle = '#ffffff';
    this.podSignatureCtx.fillRect(0, 0, this.podSignatureCanvasElement.width, this.podSignatureCanvasElement.height);
    this.podSignatureHasDrawing = false;
  }

  savePodSignature(): void {
    if (!this.podSignatureCanvasElement || !this.context) return;

    if (!this.podSignatureHasDrawing) {
      this.toast.error("Please draw the recipient's signature.");
      return;
    }
    if (!this.podRecipientName.trim()) {
      this.toast.error("Please enter the recipient's name.");
      return;
    }

    this.podSignatureCanvasElement.toBlob((blob) => {
      if (!blob || !this.context) return;
      this.podSignatureUploading = true;
      this.ordersService.uploadDeliverySignature(this.context.id, blob, this.podRecipientName.trim()).subscribe({
        next: () => {
          this.podSignatureUploading = false;
          this.podSignatureDone = true;
        },
        error: () => {
          this.podSignatureUploading = false;
          this.toast.error('Unable to upload signature. Please try again.');
        }
      });
    }, 'image/png');
  }

  markDelivered(): void {
    if (!this.context || !this.podCanMarkDelivered) return;
    const { id, next } = this.context;
    this.stopPodCamera();
    this.delivered.emit({ id, next });
  }
}
