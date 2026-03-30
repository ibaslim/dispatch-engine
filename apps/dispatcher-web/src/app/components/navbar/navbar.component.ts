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
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);

  isMobileMenuOpen = false;

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

  notificationIcon = "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9";
  helpIcon = "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
  menuIcon = "M4 6h16M4 12h16M4 18h16";

  constructor() { }

  ngOnInit(): void {
    this.auth.loadCurrentUser();
  }

  ngOnDestroy(): void {
    this.isMobileMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  onNavItemClick(): void {
    this.isMobileMenuOpen = false;
  }

  showNotification(): void {
    console.log('Notifications clicked');
  }

  showHelp(): void {
    console.log('Help clicked');
  }

  upgradePlan(): void {
    console.log('Upgrade clicked');
  }
}