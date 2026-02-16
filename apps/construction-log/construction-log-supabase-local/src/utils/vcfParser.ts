/**
 * VCF (vCard) Parser Utility
 * Parses VCF files and extracts contact information
 */

export interface VCFContact {
  fullName?: string;
  organization?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

/**
 * Parse a VCF file content and extract contacts
 */
export const parseVCF = (content: string): VCFContact[] => {
  const contacts: VCFContact[] = [];
  
  // Split by VCARD boundaries
  const vcards = content.split(/(?=BEGIN:VCARD)/i);
  
  for (const vcard of vcards) {
    if (!vcard.trim() || !vcard.toUpperCase().includes('BEGIN:VCARD')) continue;
    
    const contact: VCFContact = {};
    
    // Handle folded lines (lines that continue with space/tab)
    const unfoldedVcard = vcard.replace(/\r?\n[ \t]/g, '');
    const lines = unfoldedVcard.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Parse different VCF properties
      if (trimmedLine.toUpperCase().startsWith('FN:') || trimmedLine.toUpperCase().startsWith('FN;')) {
        contact.fullName = extractValue(trimmedLine);
      } else if (trimmedLine.toUpperCase().startsWith('ORG:') || trimmedLine.toUpperCase().startsWith('ORG;')) {
        contact.organization = extractValue(trimmedLine).split(';')[0]; // Take first part of org
      } else if (trimmedLine.toUpperCase().startsWith('TEL:') || trimmedLine.toUpperCase().startsWith('TEL;')) {
        // Only set if not already set (prefer first phone)
        if (!contact.phone) {
          contact.phone = extractValue(trimmedLine);
        }
      } else if (trimmedLine.toUpperCase().startsWith('EMAIL:') || trimmedLine.toUpperCase().startsWith('EMAIL;')) {
        // Only set if not already set (prefer first email)
        if (!contact.email) {
          contact.email = extractValue(trimmedLine);
        }
      } else if (trimmedLine.toUpperCase().startsWith('ADR:') || trimmedLine.toUpperCase().startsWith('ADR;')) {
        const addressParts = extractValue(trimmedLine).split(';');
        // ADR format: PO Box; Extended Address; Street; City; State/Province; Postal Code; Country
        if (addressParts.length >= 3 && addressParts[2]) {
          contact.address = addressParts[2];
        }
        if (addressParts.length >= 4 && addressParts[3]) {
          contact.city = addressParts[3];
        }
        if (addressParts.length >= 6 && addressParts[5]) {
          contact.postalCode = addressParts[5];
        }
        if (addressParts.length >= 7 && addressParts[6]) {
          contact.country = addressParts[6];
        }
      } else if (trimmedLine.toUpperCase().startsWith('NOTE:') || trimmedLine.toUpperCase().startsWith('NOTE;')) {
        contact.notes = extractValue(trimmedLine).replace(/\\n/g, '\n').replace(/\\,/g, ',');
      }
    }
    
    // Only add if we have at least a name or organization
    if (contact.fullName || contact.organization) {
      contacts.push(contact);
    }
  }
  
  return contacts;
};

/**
 * Extract value from a VCF line, handling parameters
 */
const extractValue = (line: string): string => {
  // Find the first colon that separates property from value
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return '';
  
  let value = line.substring(colonIndex + 1);
  
  // Unescape common VCF escape sequences
  value = value.replace(/\\n/gi, '\n');
  value = value.replace(/\\,/g, ',');
  value = value.replace(/\\;/g, ';');
  value = value.replace(/\\\\/g, '\\');
  
  return value.trim();
};

/**
 * Read and parse a VCF file
 */
export const readVCFFile = (file: File): Promise<VCFContact[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const contacts = parseVCF(content);
        resolve(contacts);
      } catch (error) {
        reject(new Error('Error parsing VCF file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    reader.readAsText(file);
  });
};
