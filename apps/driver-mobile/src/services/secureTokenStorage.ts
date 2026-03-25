import * as SecureStore from 'expo-secure-store';
import type { TokenStorage } from '@dispatch/shared/api-client';

export class SecureTokenStorage implements TokenStorage {
  private readonly accessKey = 'dispatch:access_token';
  private readonly refreshKey = 'dispatch:refresh_token';

  getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(this.accessKey);
  }

  getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(this.refreshKey);
  }

  async setTokens(access: string, refresh: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(this.accessKey, access),
      SecureStore.setItemAsync(this.refreshKey, refresh),
    ]);
  }

  async clearTokens(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(this.accessKey),
      SecureStore.deleteItemAsync(this.refreshKey),
    ]);
  }
}