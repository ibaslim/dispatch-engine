import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { PopupComponent } from '@components/popup/popup.component';

@Component({
  selector: 'app-directions-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent],
  templateUrl: './directions-modal.component.html'
})
export class DirectionsModalComponent {
  @Input() open = false;
  @Input() row: { pickupAddress?: string; deliveryAddress?: string } | null = null;
  @Output() close = new EventEmitter<void>();

  constructor(private readonly router: Router) { }

  onClose(): void {
    this.close.emit();
  }

  navigateToDirections(target: 'pickup' | 'delivery'): void {
    const row = this.row;
    if (!row) return;

    const address = target === 'pickup' ? row.pickupAddress : row.deliveryAddress;
    this.onClose();
    if (!address) return;

    this.router.navigate(['/map'], {
      queryParams: {
        destination: address,
        label: target === 'pickup' ? 'Pickup' : 'Receiver'
      }
    });
  }
}
