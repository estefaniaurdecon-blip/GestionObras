/**
 * Converts a hex color to HSL format
 * @param hex - Hex color string (e.g., "#2563eb")
 * @returns HSL string (e.g., "217 91% 60%")
 */
export function hexToHSL(hex: string): string {
  // Remove the # if present
  hex = hex.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  // Convert to degrees, percentage
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  const lPercent = Math.round(l * 100);

  return `${h} ${s}% ${lPercent}%`;
}

/**
 * Calculates relative luminance of a color
 * Used to determine if text should be light or dark for contrast
 */
function getLuminance(hex: string): number {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const [rs, gs, bs] = [r, g, b].map(c => 
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Determines if text should be light or dark based on background color
 * @param hex - Background color in hex format
 * @returns true if text should be light, false if dark
 */
export function shouldUseLightText(hex: string): boolean {
  const luminance = getLuminance(hex);
  // WCAG 2.0 recommendation: use light text if luminance is less than 0.5
  return luminance < 0.5;
}

/**
 * Applies the brand color to the document root CSS variables
 * @param brandColor - Hex color string (e.g., "#2563eb")
 */
export function applyBrandColor(brandColor: string): void {
  if (!brandColor || !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return;
  }

  const root = document.documentElement;
  const hsl = hexToHSL(brandColor);
  
  // Apply primary color
  root.style.setProperty('--primary', hsl);
  
  // Calculate and apply variants
  const [h, s, l] = hsl.match(/\d+/g)!.map(Number);
  
  // Primary hover (slightly darker)
  const hoverL = Math.max(0, l - 10);
  root.style.setProperty('--primary-hover', `${h} ${s}% ${hoverL}%`);
  
  // Primary foreground (text color on primary background)
  const useLightText = shouldUseLightText(brandColor);
  root.style.setProperty('--primary-foreground', useLightText ? '0 0% 100%' : '0 0% 0%');
  
  // Accent color (slightly lighter variant)
  const accentL = Math.min(100, l + 10);
  root.style.setProperty('--accent', `${h} ${s}% ${accentL}%`);
}

/**
 * Resets brand color to default
 */
export function resetBrandColor(): void {
  const root = document.documentElement;
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-hover');
  root.style.removeProperty('--primary-foreground');
  root.style.removeProperty('--accent');
}
