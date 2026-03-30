import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-user-dropdown-icon',
  imports: [CommonModule],
  templateUrl: './user-dropdown-icon.component.html',
  styleUrl: './user-dropdown-icon.component.css'
})
export class UserDropdownIconComponent {
  @Input() userName: string = 'User';
  @Input() userEmail: string = 'user@email.com';
  @Output() logout = new EventEmitter<void>();

  isOpen = false;

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
