import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  offerCountdownBarClass,
  offerCountdownLabel,
  offerCountdownPercent,
  offerCountdownTextClass,
  type OfferCard,
} from '@pages/orders/offer.util';

/** One live offer in a driver's New Orders list. */
@Component({
  selector: 'app-offer-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './offer-card.component.html',
  styles: [`:host { display: block; }`],
})
export class OfferCardComponent {
  @Input() card!: OfferCard;
  @Output() accept = new EventEmitter<void>();
  @Output() details = new EventEmitter<void>();

  get expired(): boolean {
    return this.card.remainingSeconds <= 0;
  }

  get countdown(): string {
    return offerCountdownLabel(this.card.remainingSeconds);
  }

  get percent(): number {
    return Math.max(2, offerCountdownPercent(this.card.remainingSeconds));
  }

  get barClass(): string {
    return offerCountdownBarClass(this.card.remainingSeconds);
  }

  get timerClass(): string {
    return offerCountdownTextClass(this.card.remainingSeconds);
  }
}
