/**
 * Token storage for API authentication
 * Replaces Supabase session storage with JWT token storage
 */
import { z } from 'zod';
import { storage } from '@/utils/storage';

const TOKEN_KEY = 'api_access_token';
const TOKEN_TYPE_KEY = 'api_token_type';

function normalizeTokenType(tokenType?: string | null): string {
  if (!tokenType) return 'Bearer';
  return tokenType.trim().toLowerCase() === 'bearer' ? 'Bearer' : tokenType.trim();
}

// Runtime export to avoid ESM "no export named" crashes when imported as a value.
export const TokenData = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).default('Bearer'),
});
export type TokenData = z.infer<typeof TokenData>;

/**
 * Get stored token data
 */
export async function getToken(): Promise<TokenData | null> {
  try {
    const access_token = await storage.getItem(TOKEN_KEY);
    const token_type = await storage.getItem(TOKEN_TYPE_KEY);
    
    if (!access_token) return null;
    
    const parsed = TokenData.safeParse({
      access_token,
      token_type: normalizeTokenType(token_type),
    });

    if (!parsed.success) {
      console.warn('[TokenStorage] Invalid token data stored, clearing token');
      await clearToken();
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('[TokenStorage] Error getting token:', error);
    return null;
  }
}

/**
 * Store token data
 */
export async function setToken(tokenData: TokenData): Promise<void> {
  try {
    const parsed = TokenData.safeParse(tokenData);
    if (!parsed.success) {
      console.error('[TokenStorage] Invalid token data, not storing:', parsed.error);
      return;
    }

    await storage.setItem(TOKEN_KEY, parsed.data.access_token);
    await storage.setItem(TOKEN_TYPE_KEY, normalizeTokenType(parsed.data.token_type));
  } catch (error) {
    console.error('[TokenStorage] Error setting token:', error);
  }
}

/**
 * Clear stored token (logout)
 */
export async function clearToken(): Promise<void> {
  try {
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(TOKEN_TYPE_KEY);
  } catch (error) {
    console.error('[TokenStorage] Error clearing token:', error);
  }
}

/**
 * Check if user is authenticated (has token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token?.access_token;
}

/**
 * Build Authorization header for API requests.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const tokenData = await getToken();
  if (!tokenData) return {};
  return {
    Authorization: `${normalizeTokenType(tokenData.token_type)} ${tokenData.access_token}`,
  };
}
