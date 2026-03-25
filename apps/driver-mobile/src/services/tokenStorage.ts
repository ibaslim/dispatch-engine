import { SecureTokenStorage } from './secureTokenStorage';

const storage = new SecureTokenStorage();

export async function getAccessToken(): Promise<string | null> {
  return storage.getAccessToken();
}

export async function getRefreshToken(): Promise<string | null> {
  return storage.getRefreshToken();
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await storage.setTokens(access, refresh);
}

export async function clearTokens(): Promise<void> {
  await storage.clearTokens();
}
