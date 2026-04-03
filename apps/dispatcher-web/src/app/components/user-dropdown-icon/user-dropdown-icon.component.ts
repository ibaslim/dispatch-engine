import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'user-dropdown-icon',
  standalone: true,
  imports: [CommonModule, ButtonComponent, RouterModule],
  templateUrl: './user-dropdown-icon.component.html'
})
export class UserDropdownIconComponent {
  @Input() userName: string = 'User';
  @Input() userEmail: string = 'user@email.com';
  @Output() logout = new EventEmitter<void>();

  isOpen = false;
  isLanguageOpen = false;

  languages = [
    'English',
    'Español',
    'Français',
    'Italiano',
    'Português',
    'Türkçe',
    'Русский',
    'Deutsch',
    'Română'
  ];

  activeLanguage = 'English';

  setLanguage(lang: string) {
    this.activeLanguage = lang;
    this.isLanguageOpen = false;
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
  }

  closeDropdown(): void {
    this.isOpen = false;
  }

  handleLogout(): void {
    this.closeDropdown();
    this.logout.emit();
  }

  get initials(): string {
    return this.userName?.substring(0, 2).toUpperCase() || 'U';
  }
}