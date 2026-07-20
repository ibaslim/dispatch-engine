import { Component, inject, signal } from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ThemeService } from '@services/theme.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="sticky top-0 z-50 bg-white/95 backdrop-blur dark:bg-gray-900/95">
      <div class="container mx-auto px-4 sm:px-6">
        <div class="flex items-center justify-between h-16 sm:h-20">
          <a
            routerLink="/"
            class="flex items-center gap-3 shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow"
          >
            <img
              src="assets/logo-courier.webp"
              alt="Central Courier Services — Fast. Reliable. Always on time"
              class="h-10 sm:h-14 w-auto  dark:invert"
            />
          </a>

          <div class="flex items-center gap-2 sm:gap-4">
            <!-- Desktop-only secondary links -->
            <a
              href="tel:+17807520248"
              class="hidden lg:flex items-center gap-2 text-sm font-bold text-courier-slate hover:text-courier-green transition-colors dark:text-gray-300 dark:hover:text-courier-lime"
            >
              <svg class="h-4 w-4 text-courier-green" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.6 10.8a15.9 15.9 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.6a1 1 0 01-.25 1l-2.22 2.2z"/>
              </svg>
              780-752-0248
            </a>
            <a
              routerLink="/about"
              class="hidden md:block text-sm font-bold text-courier-slate hover:text-courier-green underline-offset-8 decoration-dashed decoration-2 decoration-courier-yellow hover:underline transition-colors dark:text-gray-300 dark:hover:text-courier-lime"
            >
              About Us
            </a>

            <!-- Always visible -->
            <button
              type="button"
              (click)="theme.toggle()"
              class="inline-flex items-center justify-center h-9 w-9 rounded-full text-courier-slate hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow dark:text-gray-300 dark:hover:bg-gray-800"
              [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            >
              @if (theme.theme() === 'dark') {
                <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                </svg>
              } @else {
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.7 15.3a8.5 8.5 0 01-11-11 8.5 8.5 0 1011 11z"/>
                </svg>
              }
            </button>
            <button
              type="button"
              (click)="trackPackage()"
              class="btn"
            >
              Track Order
            </button>

            <!-- Hamburger: collapses the phone/About Us links below md -->
            <button
              type="button"
              (click)="menuOpen.set(!menuOpen())"
              class="inline-flex items-center justify-center h-9 w-9 rounded-full text-courier-slate hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
              aria-controls="mobile-menu"
              [attr.aria-expanded]="menuOpen()"
              [attr.aria-label]="menuOpen() ? 'Close menu' : 'Open menu'"
            >
              @if (menuOpen()) {
                <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M6 18L18 6"/>
                </svg>
              } @else {
                <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16"/>
                </svg>
              }
            </button>
          </div>
        </div>

        <!-- Mobile menu panel: secondary links only — Track a package always stays on the main row -->
        @if (menuOpen()) {
          <div id="mobile-menu" class="md:hidden pb-5 flex flex-col gap-1">
            <a
              href="tel:+17807520248"
              class="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-courier-slate hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <svg class="h-4 w-4 text-courier-green" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.6 10.8a15.9 15.9 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.6a1 1 0 01-.25 1l-2.22 2.2z"/>
              </svg>
              780-752-0248
            </a>
            <a
              routerLink="/about"
              (click)="menuOpen.set(false)"
              class="rounded-lg px-3 py-2.5 text-sm font-bold text-courier-slate hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-gray-800"
            >
              About Us
            </a>
          </div>
        }
      </div>

      <!-- Road strip: yellow band with dashed center line -->
      <div class="h-2 bg-courier-yellow relative" aria-hidden="true">
        <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-courier-ink/60"></div>
      </div>
    </nav>
  `,
})
export class NavbarComponent {
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  readonly menuOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationStart => e instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  /**
   * Go to the tracking page (keeping the current order view if already
   * on one), then scroll to the search field and focus it.
   */
  async trackPackage(): Promise<void> {
    this.menuOpen.set(false);
    if (!this.router.url.startsWith('/t')) {
      await this.router.navigate(['/t']);
    }
    // Wait a tick so the tracking page has rendered its input.
    setTimeout(() => {
      const input = document.getElementById('order-number');
      if (!input) return;
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      input.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
      (input as HTMLInputElement).focus({ preventScroll: true });
    });
  }
}
