import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="sticky top-0 z-50 bg-white/95 backdrop-blur">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="flex items-center justify-between h-16 sm:h-20">
          <a
            routerLink="/"
            class="flex items-center gap-3 shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow"
          >
            <img
              src="assets/logo-courier.webp"
              alt="Central Courier Services — Fast. Reliable. Always on time"
              class="h-10 sm:h-14 w-auto"
            />
          </a>

          <div class="flex items-center gap-4 sm:gap-7">
            <a
              href="tel:+17807520248"
              class="hidden lg:flex items-center gap-2 text-sm font-bold text-courier-slate hover:text-courier-green transition-colors"
            >
              <svg class="h-4 w-4 text-courier-green" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.6 10.8a15.9 15.9 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.6a1 1 0 01-.25 1l-2.22 2.2z"/>
              </svg>
              780-752-0248
            </a>
            <a
              routerLink="/posts"
              class="hidden sm:block text-sm font-bold text-courier-slate hover:text-courier-green underline-offset-8 decoration-dashed decoration-2 decoration-courier-yellow hover:underline transition-colors"
            >
              About Us
            </a>
            <button
              type="button"
              (click)="trackPackage()"
              class="inline-flex items-center rounded-full bg-courier-yellow hover:bg-amber-300 text-courier-ink text-sm font-extrabold px-5 py-2.5 shadow-sm hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-ink"
            >
              Track a package
            </button>
          </div>
        </div>
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

  /**
   * Go to the tracking page (keeping the current order view if already
   * on one), then scroll to the search field and focus it.
   */
  async trackPackage(): Promise<void> {
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
