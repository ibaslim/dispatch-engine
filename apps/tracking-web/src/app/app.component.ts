import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavbarComponent } from './components/navbar/navbar.component';
import { BannerComponent } from './components/banner/banner.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, BannerComponent, FooterComponent],
  template: `
    <a
      href="#content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-courier-yellow focus:px-5 focus:py-2.5 focus:text-sm focus:font-extrabold focus:text-courier-ink"
    >
      Skip to content
    </a>

    <div class="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <app-navbar></app-navbar>

      @if (showBanner()) {
        <app-banner></app-banner>
      }

      <div id="content" class="flex-1">
        <router-outlet></router-outlet>
      </div>

      <app-footer></app-footer>
    </div>
  `,
})
export class AppComponent {
  private readonly router = inject(Router);

  /** The hero belongs to the tracking journey: home and /t routes only. */
  readonly showBanner = signal(true);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split('?')[0];
        this.showBanner.set(
          path === '/' || path === '/t' || path.startsWith('/t/')
        );
      });
  }
}