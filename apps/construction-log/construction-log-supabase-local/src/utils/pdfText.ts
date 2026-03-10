import type jsPDF from "jspdf";

/**
 * jsPDF built-in fonts (Helvetica) have limited Unicode support.
 * This sanitizer keeps common Latin-1 characters (incl. ñ, á, etc.),
 * normalizes punctuation, removes invisible chars and strips emojis/
 * unsupported unicode that can cause font corruption and style mixing.
 */
export const sanitizePdfText = (input: string): string => {
  if (!input) return "";

  // Normalize newlines early
  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .normalize("NFKC");

  return (
    normalized
      // Convert common typography to ASCII equivalents
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, "-")
      // Remove HTML entities (named and numeric)
      .replace(/&[a-zA-Z]+;/g, "")
      .replace(/&#\d+;/g, "")
      .replace(/&#x[0-9a-fA-F]+;/g, "")
      // Replace bullets and similar glyphs
      .replace(/[•●○◦▪▸►]/g, "-")
      .replace(/[\u2022\u2023\u2043\u2219]/g, "-")
      // Remove zero-width & BOM
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      // Tabs and NBSP
      .replace(/\t/g, " ")
      .replace(/\u00A0/g, " ")
      // Avoid the Euro symbol in AI free text (often causes glyph/font glitches)
      .replace(/€/g, "EUR")
      // Strip characters outside Latin-1 + basic ASCII + newline
      // (this removes emojis and most problematic unicode)
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x0A\x20-\x7E\u00A0-\u00FF]/g, "")
      // Collapse whitespace
      .replace(/ {2,}/g, " ")
      .trimEnd()
  );
};

const splitLongToken = (doc: jsPDF, token: string, maxWidth: number): string[] => {
  // Hard-split tokens that exceed maxWidth (e.g., long IDs/URLs)
  const parts: string[] = [];
  let current = "";

  for (const ch of token) {
    const candidate = current + ch;
    if (doc.getTextWidth(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) parts.push(current);
    // If a single glyph is wider than maxWidth, still emit it to avoid infinite loops.
    current = ch;
  }

  if (current) parts.push(current);
  return parts;
};

/**
 * Word-wrap that also hard-splits long tokens without spaces.
 * Relies on doc's current font + fontSize.
 */
export const wrapPdfText = (doc: jsPDF, text: string, maxWidth: number): string[] => {
  const safe = sanitizePdfText(text);
  if (!safe) return [];

  const words = safe.split(/\s+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (doc.getTextWidth(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (doc.getTextWidth(word) <= maxWidth) {
      current = word;
      continue;
    }

    const parts = splitLongToken(doc, word, maxWidth);
    if (parts.length === 1) {
      current = parts[0];
    } else {
      lines.push(...parts.slice(0, -1));
      current = parts[parts.length - 1];
    }
  }

  if (current) lines.push(current);
  return lines;
};
