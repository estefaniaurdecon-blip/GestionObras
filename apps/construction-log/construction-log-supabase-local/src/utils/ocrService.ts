import { pipeline } from '@huggingface/transformers';

// Configure transformers to use browser cache
import { env } from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;

interface OCRResult {
  text: string;
  confidence: number;
}

interface ParsedMaterialData {
  supplier?: string;
  invoiceNumber?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
  }>;
  date?: string;
}

class OCRService {
  private static ocrPipeline: any = null;

  static async initializeOCR() {
    if (!this.ocrPipeline) {
      console.log('Inicializando OCR...');
      try {
        // Using a lightweight OCR model that works well in browsers
        this.ocrPipeline = await pipeline('image-to-text', 'Xenova/trocr-base-printed', {
          device: 'webgpu'
        });
      } catch (error) {
        console.warn('WebGPU no disponible, usando CPU:', error);
        this.ocrPipeline = await pipeline('image-to-text', 'Xenova/trocr-base-printed');
      }
    }
    return this.ocrPipeline;
  }

  static async extractTextFromImage(imageElement: HTMLImageElement): Promise<OCRResult> {
    try {
      await this.initializeOCR();
      
      // Convert image to canvas for processing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('No se pudo crear el contexto del canvas');
      
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      ctx.drawImage(imageElement, 0, 0);
      
      // Enviar canvas directamente al pipeline (mejor que base64)
      const output = await this.ocrPipeline(canvas);
      // transformers.js puede devolver un array de resultados
      const first = Array.isArray(output) ? output[0] : output;
      const text = first?.generated_text?.trim?.() || '';
      
      return {
        text,
        confidence: text ? 0.85 : 0
      };
    } catch (error) {
      console.error('Error en OCR:', error);
      // Fallback to basic text extraction
      return this.fallbackOCR(imageElement);
    }
  }

  private static async fallbackOCR(imageElement: HTMLImageElement): Promise<OCRResult> {
    // Use browser's built-in text recognition if available
    if ('TextDetector' in window) {
      try {
        const textDetector = new (window as any).TextDetector();
        const results = await textDetector.detect(imageElement);
        const text = results.map((result: any) => result.rawValue).join(' ');
        return { text, confidence: 0.6 };
      } catch (error) {
        console.warn('TextDetector no disponible:', error);
      }
    }
    
    // Basic fallback - return empty text
    return { text: '', confidence: 0 };
  }

  static parseMaterialData(ocrText: string): ParsedMaterialData {
    const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const result: ParsedMaterialData = {
      items: []
    };

    // Common patterns for material delivery notes
    const supplierPatterns = [
      /(?:proveedor|empresa|suministrador)[:\s]*([^\n]+)/i,
      /^([A-Z][A-Za-z\s&,.-]+(?:S\.?L\.?|S\.?A\.?|S\.?C\.?))\s*$/i
    ];

    const invoicePatterns = [
      /(?:albar[aá]n|factura|n[úu]mero)[:\s#]*([A-Z0-9-]+)/i,
      /n[º°]\s*([A-Z0-9-]+)/i
    ];

    const datePatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
      /(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/i
    ];

    // Material item patterns
    const itemPatterns = [
      /^([A-Za-z\s]+?)\s+(\d+(?:[,\.]\d+)?)\s*([a-zA-Z]{1,3})\s*(?:(\d+(?:[,\.]\d+)?)\s*[€$]?)?/,
      /(\d+(?:[,\.]\d+)?)\s+([a-zA-Z]{1,3})\s+([A-Za-z\s]+?)(?:\s+(\d+(?:[,\.]\d+)?)\s*[€$]?)?/
    ];

    // Parse supplier
    for (const line of lines) {
      for (const pattern of supplierPatterns) {
        const match = line.match(pattern);
        if (match && !result.supplier) {
          result.supplier = match[1].trim();
          break;
        }
      }
    }

    // Parse invoice number
    for (const line of lines) {
      for (const pattern of invoicePatterns) {
        const match = line.match(pattern);
        if (match && !result.invoiceNumber) {
          result.invoiceNumber = match[1].trim();
          break;
        }
      }
    }

    // Parse date
    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match && !result.date) {
          if (pattern.source.includes('\\w+')) {
            // Month name format
            const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const monthIndex = monthNames.findIndex(m => m.toLowerCase().includes(match[2].toLowerCase()));
            if (monthIndex !== -1) {
              result.date = `${match[3]}-${String(monthIndex + 1).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
            }
          } else {
            // Numeric format
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            result.date = `${year}-${month}-${day}`;
          }
          break;
        }
      }
    }

    // Parse material items
    for (const line of lines) {
      for (const pattern of itemPatterns) {
        const match = line.match(pattern);
        if (match) {
          let name, quantity, unit, unitPrice;
          
          if (pattern.source.startsWith('^([A-Za-z\\s]+?)')) {
            // Pattern: name quantity unit price
            name = match[1].trim();
            quantity = parseFloat(match[2].replace(',', '.'));
            unit = match[3];
            unitPrice = match[4] ? parseFloat(match[4].replace(',', '.')) : undefined;
          } else {
            // Pattern: quantity unit name price
            quantity = parseFloat(match[1].replace(',', '.'));
            unit = match[2];
            name = match[3].trim();
            unitPrice = match[4] ? parseFloat(match[4].replace(',', '.')) : undefined;
          }

          if (name && !isNaN(quantity) && unit) {
            result.items?.push({
              name,
              quantity,
              unit,
              unitPrice
            });
          }
          break;
        }
      }
    }

    return result;
  }
}

export { OCRService, type OCRResult, type ParsedMaterialData };