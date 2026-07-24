import { Component } from '@angular/core';

@Component({
  selector: 'app-banner',
  standalone: true,
  template: `
    <section
      class="relative w-full h-72 sm:h-96 lg:h-[26rem] bg-cover bg-center"
      style="background-image: url('assets/banner.webp')"
      role="img"
      aria-label="A Central Courier driver carrying parcels from a yellow delivery van"
    >
      <!-- Keep the van visible on the right; darken the left for text -->
      <div class="absolute inset-0 bg-gradient-to-r from-courier-ink/90 via-courier-slate/60 to-transparent"></div>

      <div class="relative h-full container mx-auto px-4 sm:px-6 flex flex-col justify-center">
        <p class="banner-rise text-courier-lime text-xs sm:text-sm font-extrabold tracking-[0.25em] uppercase mb-3">
          Central Courier Services
        </p>
        <h1 class="banner-rise font-display text-4xl sm:text-6xl lg:text-7xl leading-tight drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)]">
          <span class="text-courier-yellow">Track</span>
          <span class="text-white"> your delivery</span>
        </h1>
        <p class="banner-rise-delay mt-3 text-white/90 text-base sm:text-lg font-semibold max-w-md drop-shadow">
          Fast. Reliable. Always on time — follow your package every step of the way.
        </p>
      </div>
    </section>
  `,
})
export class BannerComponent {}
