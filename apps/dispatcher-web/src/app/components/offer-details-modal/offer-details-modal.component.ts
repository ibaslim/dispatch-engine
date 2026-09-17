import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PopupComponent } from '@components/popup/popup.component';
import {
  formatTrip,
  offerCountdownLabel,
  offerCountdownTextClass,
  type OfferCard,
} from '@pages/orders/offer.util';

/**
 * A live offer in full, so a driver can judge it before accepting. Contact
 * details are withheld: an unclaimed order's sender and recipient aren't this
 * driver's to call yet.
 */
@Component({
  selector: 'app-offer-details-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent],
  templateUrl: './offer-details-modal.component.html',
})
export class OfferDetailsModalComponent {
  @Input() open = false;
  /** Null once the offer leaves the list: accepted elsewhere, or the window closed. */
  @Input() card: OfferCard | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() accept = new EventEmitter<OfferCard>();

  get title(): string {
    return this.card ? `Offer #${this.card.orderNumber}` : 'Offer';
  }

  get countdown(): string {
    return this.card ? offerCountdownLabel(this.card.remainingSeconds) : '';
  }

  get timerClass(): string {
    return this.card ? offerCountdownTextClass(this.card.remainingSeconds) : '';
  }

  get trip(): string | null {
    return this.card ? formatTrip(this.card.routeDistanceMeters, this.card.routeDurationSeconds) : null;
  }

  get hasBreakdown(): boolean {
    return !!this.card && (this.card.feePayout !== null || this.card.tipPayout !== null);
  }

  get canAccept(): boolean {
    return !!this.card && this.card.remainingSeconds > 0 && !this.card.accepting && !this.card.accepted;
  }

  onAccept(): void {
    if (this.card && this.canAccept) this.accept.emit(this.card);
  }
}
