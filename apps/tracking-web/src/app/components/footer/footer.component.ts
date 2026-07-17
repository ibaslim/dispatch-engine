import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="bg-courier-ink text-gray-300">
      <!-- Road strip: yellow band with dashed center line -->
      <div class="h-2 bg-courier-yellow relative" aria-hidden="true">
        <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-courier-ink/60"></div>
      </div>

      <div class="container mx-auto px-4 sm:px-6 py-14">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-12">
          <!-- Logo + contact -->
          <div>
            <a
              routerLink="/"
              class="inline-block mb-6 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow"
            >
              <img
                src="assets/logo-courier.webp"
                alt="Central Courier Services — Fast. Reliable. Always on time"
                class="h-14 w-auto brightness-0 invert"
              />
            </a>
            <ul class="space-y-3 text-sm">
              <li class="flex items-start gap-3">
                <svg class="h-4 w-4 mt-0.5 shrink-0 text-courier-yellow" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6.6 10.8a15.9 15.9 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.6a1 1 0 01-.25 1l-2.22 2.2z"/>
                </svg>
                <a href="tel:+17807520248" class="hover:text-courier-yellow transition-colors">780-752-0248</a>
              </li>
              <li class="flex items-start gap-3">
                <svg class="h-4 w-4 mt-0.5 shrink-0 text-courier-yellow" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2zm8 6.7L20 7H4l8 4.7zM4 9.2V17h16V9.2l-8 4.7-8-4.7z"/>
                </svg>
                <a href="mailto:admin@centralcourier.ca" class="hover:text-courier-yellow transition-colors">
                  admin&#64;centralcourier.ca
                </a>
              </li>
              <li class="flex items-start gap-3 leading-relaxed">
                <svg class="h-4 w-4 mt-0.5 shrink-0 text-courier-yellow" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7zm0 9.5A2.5 2.5 0 109.5 9a2.5 2.5 0 002.5 2.5z"/>
                </svg>
                <span>#201-9182 34a Ave NW,<br />Edmonton, AB T6E 5P4, Canada</span>
              </li>
            </ul>
          </div>

          <!-- Newsletter -->
          <div>
            <h3 class="text-white font-display text-lg tracking-wide mb-1">Newsletter</h3>
            <div class="w-10 border-t-2 border-dashed border-courier-yellow mb-4" aria-hidden="true"></div>
            <p class="text-sm mb-4">
              Get delivery updates and news from Central Courier.
            </p>
            <form class="flex" (submit)="$event.preventDefault()">
              <label class="sr-only" for="footer-email">Email address</label>
              <input
                id="footer-email"
                type="email"
                placeholder="Email address"
                class="w-full min-w-0 rounded-l-md bg-white/10 border border-white/20 border-r-0 px-4 py-2.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-courier-yellow"
              />
              <button
                type="submit"
                class="shrink-0 rounded-r-md bg-courier-yellow hover:bg-amber-300 text-courier-ink text-sm font-extrabold px-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Subscribe
              </button>
            </form>
          </div>

          <!-- Social -->
          <div>
            <h3 class="text-white font-display text-lg tracking-wide mb-1">Follow us</h3>
            <div class="w-10 border-t-2 border-dashed border-courier-yellow mb-4" aria-hidden="true"></div>
            <div class="flex items-center gap-3">
              <a
                href="#"
                aria-label="Facebook"
                class="flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-courier-yellow hover:text-courier-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.6V3.9c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V10H7.8v3h2.7v8h3z"/>
                </svg>
              </a>
              <a
                href="#"
                aria-label="Instagram"
                class="flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-courier-yellow hover:text-courier-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.9.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.9.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.9-.9-1.4-.2-.4-.4-1.1-.4-2.2-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.9-.7 1.4-.9.4-.2 1.1-.4 2.2-.4 1.2-.1 1.6-.1 4.8-.1zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.2.8-.4.4-.6.7-.8 1.2-.1.4-.3 1-.4 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.2.4.4.7.6 1.2.8.4.1 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.2-.8.4-.4.6-.7.8-1.2.1-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.2-.4-.4-.7-.6-1.2-.8-.4-.1-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.1a4.9 4.9 0 110 9.8 4.9 4.9 0 010-9.8zm0 8.1a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zm6.2-8.3a1.1 1.1 0 11-2.3 0 1.1 1.1 0 012.3 0z"/>
                </svg>
              </a>
              <a
                href="#"
                aria-label="Twitter"
                class="flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-courier-yellow hover:text-courier-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-courier-yellow"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 5.9c-.7.3-1.5.6-2.4.7.8-.5 1.5-1.3 1.8-2.3-.8.5-1.7.8-2.6 1a4.1 4.1 0 00-7 3.7A11.7 11.7 0 013.4 4.8a4.1 4.1 0 001.3 5.5c-.7 0-1.3-.2-1.9-.5v.1c0 2 1.4 3.6 3.3 4-.6.2-1.2.2-1.9.1a4.1 4.1 0 003.9 2.9A8.3 8.3 0 012 18.6a11.7 11.7 0 006.3 1.8c7.5 0 11.7-6.3 11.7-11.7v-.5c.8-.6 1.5-1.3 2-2.2z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div class="mt-12 pt-6 border-t border-white/10 text-center text-sm text-gray-400">
          &copy; {{ year }} Central Courier Services. Fast. Reliable. Always on time.
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
}
