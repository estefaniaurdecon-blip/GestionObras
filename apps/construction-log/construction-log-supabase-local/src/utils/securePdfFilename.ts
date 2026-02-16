/**
 * Secure PDF filename sanitization utility
 * 
 * This utility mitigates the jsPDF Path Traversal vulnerability (GHSA-f8cm-6447-x5h2)
 * by sanitizing filenames before they are passed to doc.save()
 * 
 * The vulnerability allows attackers to use path traversal sequences (../) in filenames
 * to write files outside the intended directory. This sanitizer removes all dangerous
 * characters and ensures filenames are safe.
 */

/**
 * Sanitizes a filename to prevent path traversal attacks
 * 
 * - Removes path separators (/, \)
 * - Removes parent directory references (..)
 * - Removes null bytes and control characters
 * - Replaces spaces with underscores
 * - Removes or replaces special characters
 * - Ensures the filename ends with .pdf
 * - Limits filename length to prevent buffer issues
 * 
 * @param filename - The original filename to sanitize
 * @returns A safe filename that cannot be used for path traversal
 */
export const sanitizePdfFilename = (filename: string): string => {
  if (!filename || typeof filename !== 'string') {
    return `document_${Date.now()}.pdf`;
  }

  let sanitized = filename
    // Remove null bytes and control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Remove path separators
    .replace(/[/\\]/g, '_')
    // Remove parent directory references
    .replace(/\.\./g, '_')
    // Remove leading dots (hidden files)
    .replace(/^\.+/, '')
    // Replace spaces with underscores
    .replace(/\s+/g, '_')
    // Remove or replace special characters that could cause issues
    .replace(/[<>:"|?*]/g, '_')
    // Remove consecutive underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Normalize unicode characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks for safety
    .trim();

  // Ensure we have a valid filename
  if (!sanitized || sanitized.length === 0) {
    sanitized = `document_${Date.now()}`;
  }

  // Ensure .pdf extension
  if (!sanitized.toLowerCase().endsWith('.pdf')) {
    sanitized = sanitized.replace(/\.pdf$/i, '') + '.pdf';
  }

  // Limit filename length (most filesystems support 255 chars, we use 200 for safety)
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    const extension = '.pdf';
    sanitized = sanitized.slice(0, maxLength - extension.length) + extension;
  }

  return sanitized;
};

/**
 * Creates a safe PDF filename from dynamic parts
 * Useful when building filenames from user-provided data
 * 
 * @param parts - Array of strings to combine into a filename
 * @param separator - Separator between parts (default: '_')
 * @returns A safe filename
 */
export const createSecurePdfFilename = (parts: (string | undefined | null)[], separator: string = '_'): string => {
  const safeParts = parts
    .filter((part): part is string => !!part && typeof part === 'string')
    .map(part => 
      part
        .replace(/[/\\<>:"|?*\x00-\x1f\x7f]/g, '')
        .replace(/\.\./g, '')
        .replace(/\s+/g, '_')
        .trim()
    )
    .filter(part => part.length > 0);

  if (safeParts.length === 0) {
    return `document_${Date.now()}.pdf`;
  }

  return sanitizePdfFilename(safeParts.join(separator) + '.pdf');
};
