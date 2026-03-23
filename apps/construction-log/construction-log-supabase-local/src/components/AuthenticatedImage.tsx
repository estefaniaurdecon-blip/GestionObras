import { ImgHTMLAttributes, useEffect, useState } from 'react';
import { fetchImageWithAuth, isAuthenticatedImageUrl } from '@/integrations/api/imageAuth';

type AuthenticatedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

/**
 * Drop-in replacement for <img> when the src may point to an authenticated
 * API endpoint (e.g. /api/v1/work-reports/images/…).
 *
 * - data: URLs and non-authenticated URLs are rendered immediately.
 * - Authenticated URLs are fetched with the current Bearer token and
 *   rendered via a blob object URL that is revoked on unmount.
 * - Renders nothing while the fetch is in progress (no flash of broken img).
 */
export const AuthenticatedImage = ({ src, ...props }: AuthenticatedImageProps) => {
  const [displaySrc, setDisplaySrc] = useState<string>(() => {
    if (!src) return '';
    return src.startsWith('data:') || !isAuthenticatedImageUrl(src) ? src : '';
  });

  useEffect(() => {
    if (!src) {
      setDisplaySrc('');
      return;
    }

    if (src.startsWith('data:') || !isAuthenticatedImageUrl(src)) {
      setDisplaySrc(src);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    fetchImageWithAuth(src)
      .then((response) => {
        if (!response.ok || cancelled) return undefined;
        return response.blob();
      })
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        /* silently fail — img stays blank */
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!displaySrc) return null;
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={displaySrc} {...props} />;
};
