/**
 * Authenticated image fetch utilities.
 * Pure async functions — no React deps.
 * Used by AuthenticatedImage component and PDF generators.
 */
import { getAuthHeader } from './storage';

/** URL patterns that require an Authorization header. */
const AUTH_PATHS = ['/api/v1/work-reports/images/'];

export function isAuthenticatedImageUrl(url: string): boolean {
  return AUTH_PATHS.some((p) => url?.includes(p));
}

/** fetch() wrapper that adds Authorization header when the URL requires it. */
export async function fetchImageWithAuth(url: string): Promise<Response> {
  if (isAuthenticatedImageUrl(url)) {
    const headers = await getAuthHeader();
    return fetch(url, { headers });
  }
  return fetch(url);
}

/**
 * Fetch a URL (with auth if needed) and return a data-URL string.
 * Returns null on any error.
 */
export async function fetchImageAsBase64WithAuth(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetchImageWithAuth(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
