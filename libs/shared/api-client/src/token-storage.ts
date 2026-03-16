/**
 * Pluggable token storage interface.
 * Web uses localStorage/sessionStorage; React Native uses SecureStorage.
 */
export interface TokenStorage {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(access: string, refresh: string): void | Promise<void>;
  clearTokens(): void | Promise<void>;
}

/** Default web implementation using localStorage. */
export class LocalTokenStorage implements TokenStorage {
  private readonly ACCESS_KEY = 'dispatch:access_token';
  private readonly REFRESH_KEY = 'dispatch:refresh_token';

  getAccessToken(): string | null {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(this.ACCESS_KEY)
      : null;
  }

  getRefreshToken(): string | null {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(this.REFRESH_KEY)
      : null;
  }

  setTokens(access: string, refresh: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.ACCESS_KEY, access);
      localStorage.setItem(this.REFRESH_KEY, refresh);
    }
  }

  clearTokens(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.ACCESS_KEY);
      localStorage.removeItem(this.REFRESH_KEY);
    }
  }
}
