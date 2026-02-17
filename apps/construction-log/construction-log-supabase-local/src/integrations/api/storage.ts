/**
 * Token storage for API authentication
 * Replaces Supabase session storage with JWT token storage
 */
import { z } from 'zod';
import { storage } from '@/utils/storage';

const TOKEN_KEY = 'api_access_token';
const TOKEN_TYPE_KEY = 'api_token_type';
const TOKEN_EXPIRES_AT_KEY = 'api_token_expires_at';

function normalizeTokenType(tokenType?: string | null): string {
  if (!tokenType) return 'Bearer';
  return tokenType.trim().toLowerCase() === 'bearer' ? 'Bearer' : tokenType.trim();
}

// Runtime export to avoid ESM "no export named" crashes when imported as a value.
export const TokenData = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).default('Bearer'),
  expires_at: z.number().int().positive().optional(),
});
export type TokenData = z.infer<typeof TokenData>;

function decodeBase64Url(base64Url: string): string | null {
  try {
    const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return atob(normalized + padding);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadJson = decodeBase64Url(parts[1]);
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function decodeJwtExpiryMs(accessToken: string): number | null {
  const payload = decodeJwtPayload(accessToken);
  const exp = payload?.exp;
  if (typeof exp === 'number' && Number.isFinite(exp) && exp > 0) {
    return Math.trunc(exp * 1000);
  }
  if (typeof exp === 'string' && /^\d+$/.test(exp)) {
    const parsed = Number.parseInt(exp, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed * 1000);
    }
  }
  return null;
}

export function getTokenExpiryMs(tokenData: TokenData | null | undefined): number | null {
  if (!tokenData) return null;
  if (typeof tokenData.expires_at === 'number' && Number.isFinite(tokenData.expires_at)) {
    return tokenData.expires_at;
  }
  return decodeJwtExpiryMs(tokenData.access_token);
}

export function isTokenExpired(tokenData: TokenData | null | undefined, skewMs: number = 15_000): boolean {
  const expiresAtMs = getTokenExpiryMs(tokenData);
  if (expiresAtMs === null) return false;
  return Date.now() >= expiresAtMs - Math.max(0, skewMs);
}

/**
 * Get stored token data
 */
export async function getToken(): Promise<TokenData | null> {
  try {
    const access_token = await storage.getItem(TOKEN_KEY);
    const token_type = await storage.getItem(TOKEN_TYPE_KEY);
    const expires_at_raw = await storage.getItem(TOKEN_EXPIRES_AT_KEY);
    
    if (!access_token) return null;

    const expires_at =
      typeof expires_at_raw === 'string' && /^\d+$/.test(expires_at_raw)
        ? Number.parseInt(expires_at_raw, 10)
        : undefined;
    
    const parsed = TokenData.safeParse({
      access_token,
      token_type: normalizeTokenType(token_type),
      expires_at,
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
    const expiresAtMs = parsed.data.expires_at ?? decodeJwtExpiryMs(parsed.data.access_token);
    if (typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs) && expiresAtMs > 0) {
      await storage.setItem(TOKEN_EXPIRES_AT_KEY, String(Math.trunc(expiresAtMs)));
    } else {
      await storage.removeItem(TOKEN_EXPIRES_AT_KEY);
    }
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
    await storage.removeItem(TOKEN_EXPIRES_AT_KEY);
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
