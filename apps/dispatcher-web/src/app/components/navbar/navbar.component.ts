import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NavItem } from '../../models/navbar.model';
import { ButtonComponent } from '../button/button.component';
import { UserDropdownIconComponent } from '../user-dropdown-icon/user-dropdown-icon.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ButtonComponent, UserDropdownIconComponent],
  templateUrl: './navbar.component.html'
})
export class NavbarComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);

  isMobileMenuOpen = false;
  isHelpOpen = false;

  // NEW: notification toggle
  isNotificationsOn = true;
  private notificationAudio = new Audio('assets/sounds/notify.mp3');

  navItems: NavItem[] = [
    { label: 'Dispatch', route: '/dispatch' },
    { label: 'Orders', route: '/orders' },
    { label: 'Drivers', route: '/drivers' },
    { label: 'Map', route: '/map' },
    { label: 'Reviews', route: '/reviews' },
    { label: 'Reports', route: '/reports' },
    { label: 'Integrations', route: '/integrations' }
  ];

  appName = 'Dispatch Engine';
  appTagline = 'Delivery Management System';

  notificationIconOn = "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9";
  notificationIconOff = "M13.73 21a2 2 0 01-3.46 0M18.63 13A17.888 17.888 0 0118 8a6 6 0 00-9.33-5M2 2l20 20M4.27 4.27A2 2 0 006 6v4.159c0 .538-.214 1.055-.595 1.436L4 13h5m3 0h5";
  menuIcon = "M4 6h16M4 12h16M4 18h16";

  ngOnInit(): void {
    this.auth.loadCurrentUser();
  }

  ngOnDestroy(): void {
    this.isMobileMenuOpen = false;
    this.isHelpOpen = false;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  toggleHelpMenu(): void {
    this.isHelpOpen = !this.isHelpOpen;
  }

  closeHelpMenu(): void {
    this.isHelpOpen = false;
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  onNavItemClick(): void {
    this.isMobileMenuOpen = false;
  }

  // UPDATED: toggle bell + sound
  toggleNotifications(): void {
    this.isNotificationsOn = !this.isNotificationsOn;

    if (this.isNotificationsOn) {
      this.notificationAudio.currentTime = 0;
      this.notificationAudio.play().catch(() => {
        // ignore autoplay errors
      });
    }
  }

  upgradePlan(): void {
    console.log('Upgrade clicked');
  }
}