import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  HostListener,
  ContentChild,
  ElementRef,
  AfterContentInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonComponent } from '../button/button.component';
import { FormsModule } from '@angular/forms';

export type DrawerSize = 'regular' | 'large' | 'xl';

/**
 * Attribute marker used for footer slot.
 * Usage: <div data-drawer-footer>...</div>
 */

@Component({
  selector: 'app-side-drawer',
  standalone: true,
  imports: [CommonModule, ButtonComponent, FormsModule],
  templateUrl: './Side-drawer.component.html',
})
export class SideDrawerComponent implements OnChanges, AfterContentInit {
  private readonly http = inject(HttpClient);

  /** Controls open/closed state */
  @Input() open: boolean = false;

  /** Drawer size — regular (400px), large (600px), xl (800px) */
  @Input() size: DrawerSize = 'regular';

  /** Title displayed in the drawer header */
  @Input() title: string = '';

  /** Optional subtitle below the title */
  @Input() subtitle: string = '';

  /** Whether clicking the backdrop closes the drawer */
  @Input() closeOnBackdrop: boolean = true;

  /** Whether pressing Escape closes the drawer */
  @Input() closeOnEscape: boolean = true;

  /** Emits when the drawer requests to be closed */
  @Output() closed = new EventEmitter<void>();

  /** Optional invite button support */
  @Input() showInviteButton = false;
  @Input() inviteButtonLabel = '+ Invite';
  @Input() inviteEndpoint = '/api/v1/tenants/invite';
  @Input() inviteEmail = '';
  @Input() inviteRole = '';
  @Output() inviteSent = new EventEmitter<void>();

  /** Detects footer content via template ref (#drawerFooter) */
  @ContentChild('drawerFooter') footerRef?: ElementRef;

  hasFooter = false;
  isInviting = false;
  inviteError = '';
  inviteSuccess = '';

  /** Internal animation state */
  isVisible: boolean = false;
  isAnimatingOut: boolean = false;

  ngAfterContentInit(): void {
    this.hasFooter = !!this.footerRef;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.isVisible = true;
        this.isAnimatingOut = false;
      } else if (this.isVisible) {
        this.animateOut();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.closeOnEscape && this.open) {
      this.requestClose();
    }
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.requestClose();
    }
  }

  requestClose(): void {
    this.closed.emit();
  }

  private animateOut(): void {
    this.isAnimatingOut = true;
    setTimeout(() => {
      this.isVisible = false;
      this.isAnimatingOut = false;
    }, 300);
  }

  getSizeClasses(): string {
    const sizes: Record<DrawerSize, string> = {
      regular: 'w-full sm:w-[400px]',
      large:   'w-full sm:w-[600px]',
      xl:      'w-full sm:w-[800px]',
    };
    return sizes[this.size];
  }

  getDrawerClasses(): string {
    const base =
      'fixed top-0 right-0 h-full flex flex-col bg-white dark:bg-[#1e211e] shadow-2xl z-50 transition-transform duration-300 ease-in-out';
    const anim = this.isAnimatingOut ? 'translate-x-full' : 'translate-x-0';
    return `${base} ${this.getSizeClasses()} ${anim}`;
  }

  getBackdropClasses(): string {
    const base = 'fixed inset-0 z-40 bg-black transition-opacity duration-300 ease-in-out';
    return `${base} ${this.isAnimatingOut ? 'opacity-0' : 'opacity-50'}`;
  }

  get showFooter(): boolean {
    return this.hasFooter || this.showInviteButton;
  }

  async sendInvite(): Promise<void> {
    this.inviteError = '';
    this.inviteSuccess = '';

    const email = this.inviteEmail.trim();
    const role = this.inviteRole.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.inviteError = 'Enter a valid email address.';
      return;
    }

    if (!role) {
      this.inviteError = 'Select a role.';
      return;
    }

    this.isInviting = true;

    try {
      await firstValueFrom(
        this.http.post(this.inviteEndpoint, { email, role })
      );
      this.inviteSuccess = 'Invitation sent successfully.';
      this.inviteSent.emit();
    } catch (err: unknown) {
      this.inviteError = err instanceof Error ? err.message : 'Failed to send invite.';
    } finally {
      this.isInviting = false;
    }
  }

  clearInviteFeedback(): void {
    this.inviteError = '';
    this.inviteSuccess = '';
  }
}