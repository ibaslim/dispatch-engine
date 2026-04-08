import { Injectable } from '@angular/core';

export type ThemeChoice = 'system' | 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'theme';
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private current: ThemeChoice = 'system';

  // Initialize theme
  init(): void {
    const saved = (localStorage.getItem(this.storageKey) as ThemeChoice) || 'system';
    this.setTheme(saved);

    // Listen for system theme changes
    this.mediaQuery.addEventListener('change', this.handleSystemChange);
  }

  // Handle system changes when in 'system' mode
  private handleSystemChange = (e: MediaQueryListEvent) => {
    if (this.current === 'system') {
      this.applyTheme(e.matches ? 'dark' : 'light');
    }
  };

  // Set theme choice
  setTheme(choice: ThemeChoice): void {
    this.current = choice;
    localStorage.setItem(this.storageKey, choice);

    if (choice === 'system') {
      this.applyTheme(this.mediaQuery.matches ? 'dark' : 'light');
    } else {
      this.applyTheme(choice);
    }
  }

  // Get saved theme choice
  getThemeChoice(): ThemeChoice {
    return this.current;
  }

  // Get actual theme applied ('dark' or 'light')
  getResolvedTheme(): 'dark' | 'light' {
    return this.current === 'system'
      ? (this.mediaQuery.matches ? 'dark' : 'light')
      : this.current;
  }

  // Apply theme to document
  private applyTheme(mode: 'dark' | 'light'): void {
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }
}