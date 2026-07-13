import { Injectable } from '@angular/core';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { ChecksumException, FormatException, NotFoundException } from '@zxing/library';
import { Observable } from 'rxjs';

/**
 * Decodes QR codes from a live camera feed via getUserMedia (through ZXing),
 * which works both in a regular browser tab and inside a Capacitor WebView.
 * If a native Capacitor barcode-scanning plugin (e.g. @capacitor-mlkit/barcode-scanning)
 * is added later for better native camera performance, swap the body of `start()`
 * to call it behind this same Observable<string> contract — callers don't need to change.
 */
@Injectable({ providedIn: 'root' })
export class QrScannerService {
  private readonly reader = new BrowserQRCodeReader();
  private controls: IScannerControls | null = null;

  start(videoElement: HTMLVideoElement): Observable<string> {
    return new Observable<string>((subscriber) => {
      this.reader
        .decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoElement,
          (result, error, controls) => {
            this.controls = controls;
            if (result) {
              subscriber.next(result.getText());
              return;
            }
            if (!error) return;

            // ZXing's scan loop retries on its own for these — a blurry/partial
            // frame isn't a real failure, so don't tear down the subscription.
            const isRetryable = error instanceof NotFoundException
              || error instanceof ChecksumException
              || error instanceof FormatException;
            if (!isRetryable) {
              subscriber.error(error);
            }
          }
        )
        .catch((err) => subscriber.error(err));

      return () => this.stop();
    });
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
  }
}
