import { Capacitor } from '@capacitor/core';

export const toAlbaranImageSrc = (uri: string): string => {
  if (!uri) return '';
  if (/^(https?:|data:|blob:)/i.test(uri)) return uri;
  return Capacitor.convertFileSrc(uri);
};

