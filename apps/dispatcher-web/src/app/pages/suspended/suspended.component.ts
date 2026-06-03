import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ButtonComponent } from '../../components/button/button.component';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './suspended.component.html',
})
export class SuspendedComponent {
  private readonly auth = inject(AuthService);

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}

