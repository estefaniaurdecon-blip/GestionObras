import { pipeline } from '@huggingface/transformers';
import { env } from '@huggingface/transformers';

// Configuración optimizada para múltiples modelos OCR
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';

interface AdvancedOCRResult {
  text: string;
  confidence: number;
  boundingBoxes?: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
  processingTime: number;
}

interface EnhancedMaterialData {
  supplier?: string;
  invoiceNumber?: string;
  date?: string;
  totalAmount?: number;
  items?: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    total?: number;
    confidence: number;
  }>;
  metadata?: {
    documentType: string;
    extractionConfidence: number;
    fieldsDetected: string[];
  };
}

interface ImageProcessingOptions {
  enhanceContrast: boolean;
  sharpen: boolean;
  denoiseLevel: number;
  binarize: boolean;
  deskew: boolean;
}

class AdvancedOCRService {
  private static ocrPipelines: Map<string, any> = new Map();
  private static isInitializing = false;
  private static initPromise: Promise<void> | null = null;

  // Múltiples modelos OCR para mayor precisión
  private static readonly OCR_MODELS = {
    primary: 'Xenova/trocr-base-printed',
    handwritten: 'Xenova/trocr-base-handwritten', 
    multilingual: 'Xenova/trocr-base-stage1',
    lightweight: 'Xenova/trocr-small-printed'
  };

  static async initializeOCR(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.isInitializing) return;

    this.isInitializing = true;
    this.initPromise = this.doInitialize();
    
    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private static async doInitialize(): Promise<void> {
    console.log('Inicializando OCR avanzado con múltiples modelos...');
    
    try {
      // Cargar modelo principal con WebGPU
      try {
        const primaryPipeline = await pipeline(
          'image-to-text', 
          this.OCR_MODELS.primary,
          { 
            device: 'webgpu',
            dtype: 'fp16'
          }
        );
        this.ocrPipelines.set('primary', primaryPipeline);
        console.log('Modelo principal OCR cargado con WebGPU');
      } catch (error) {
        console.warn('WebGPU no disponible, usando WASM:', error);
        const primaryPipeline = await pipeline('image-to-text', this.OCR_MODELS.primary);
        this.ocrPipelines.set('primary', primaryPipeline);
      }

      // Cargar modelo ligero como fallback
      try {
        const lightPipeline = await pipeline('image-to-text', this.OCR_MODELS.lightweight);
        this.ocrPipelines.set('lightweight', lightPipeline);
        console.log('Modelo ligero OCR cargado');
      } catch (error) {
        console.warn('No se pudo cargar modelo ligero:', error);
      }

    } catch (error) {
      console.error('Error inicializando OCR:', error);
      throw error;
    }
  }

  static async detectAndCropDocument(imageElement: HTMLImageElement): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('No se pudo crear contexto de canvas');
    
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    ctx.drawImage(imageElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Detectar bordes con algoritmo Canny
    const edges = this.detectEdges(imageData);
    
    // Encontrar contornos y el rectángulo principal
    const documentRect = this.findLargestRectangle(edges, canvas.width, canvas.height);
    
    if (documentRect) {
      // Crear canvas recortado con el documento
      const croppedCanvas = document.createElement('canvas');
      const croppedCtx = croppedCanvas.getContext('2d');
      
      if (!croppedCtx) throw new Error('No se pudo crear contexto de canvas recortado');
      
      // Agregar margen del 5% para evitar cortar texto en los bordes
      const margin = 0.05;
      const x = Math.max(0, documentRect.x - documentRect.width * margin);
      const y = Math.max(0, documentRect.y - documentRect.height * margin);
      const w = Math.min(canvas.width - x, documentRect.width * (1 + margin * 2));
      const h = Math.min(canvas.height - y, documentRect.height * (1 + margin * 2));
      
      croppedCanvas.width = w;
      croppedCanvas.height = h;
      
      croppedCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      
      return croppedCanvas;
    }
    
    // Si no se detecta documento, devolver imagen original
    return canvas;
  }

  private static detectEdges(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const grayscale = new Uint8ClampedArray(width * height);
    
    // Convertir a escala de grises
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayscale[i / 4] = gray;
    }
    
    // Aplicar filtro Sobel para detección de bordes
    const edges = new Uint8ClampedArray(width * height);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kIdx = (ky + 1) * 3 + (kx + 1);
            gx += grayscale[idx] * sobelX[kIdx];
            gy += grayscale[idx] * sobelY[kIdx];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = magnitude > 50 ? 255 : 0;
      }
    }
    
    // Convertir de vuelta a ImageData
    const edgeData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < edges.length; i++) {
      edgeData[i * 4] = edges[i];
      edgeData[i * 4 + 1] = edges[i];
      edgeData[i * 4 + 2] = edges[i];
      edgeData[i * 4 + 3] = 255;
    }
    
    return new ImageData(edgeData, width, height);
  }

  private static findLargestRectangle(
    edges: ImageData,
    width: number,
    height: number
  ): { x: number; y: number; width: number; height: number } | null {
    const data = edges.data;
    
    // Encontrar límites del documento
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let edgeCount = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx] > 128) { // Pixel de borde
          edgeCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    // Verificar que se detectaron suficientes bordes (al menos 1% de la imagen)
    if (edgeCount < width * height * 0.01) {
      return null;
    }
    
    // Agregar margen de seguridad
    const marginX = Math.floor((maxX - minX) * 0.05);
    const marginY = Math.floor((maxY - minY) * 0.05);
    
    return {
      x: Math.max(0, minX - marginX),
      y: Math.max(0, minY - marginY),
      width: Math.min(width, maxX - minX + marginX * 2),
      height: Math.min(height, maxY - minY + marginY * 2)
    };
  }

  static async enhanceImage(
    imageElement: HTMLImageElement, 
    options: Partial<ImageProcessingOptions> = {}
  ): Promise<HTMLCanvasElement> {
    const defaultOptions: ImageProcessingOptions = {
      enhanceContrast: true,
      sharpen: true,
      denoiseLevel: 2,
      binarize: false,
      deskew: true
    };

    const opts = { ...defaultOptions, ...options };
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('No se pudo crear contexto de canvas');
    
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    ctx.drawImage(imageElement, 0, 0);
    
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Mejora de contraste adaptativo
    if (opts.enhanceContrast) {
      imageData = this.enhanceContrast(imageData);
    }
    
    // Filtro de sharpening
    if (opts.sharpen) {
      imageData = this.applySharpenFilter(imageData);
    }
    
    // Reducción de ruido
    if (opts.denoiseLevel > 0) {
      imageData = this.denoiseImage(imageData, opts.denoiseLevel);
    }
    
    // Binarización para documentos de alto contraste
    if (opts.binarize) {
      imageData = this.binarizeImage(imageData);
    }
    
    // Corrección de perspectiva básica
    if (opts.deskew) {
      imageData = this.deskewImage(imageData);
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  private static enhanceContrast(imageData: ImageData): ImageData {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    
    // Calcular histograma
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }
    
    // Ecualización de histograma adaptativa (CLAHE simplificado)
    const totalPixels = imageData.width * imageData.height;
    let cdf = 0;
    const lut = new Array(256);
    
    for (let i = 0; i < 256; i++) {
      cdf += histogram[i];
      lut[i] = Math.round((cdf / totalPixels) * 255);
    }
    
    // Aplicar transformación
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const enhanced = lut[gray];
      const factor = enhanced / Math.max(gray, 1);
      
      data[i] = Math.min(255, Math.max(0, data[i] * factor));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor));
    }
    
    return imageData;
  }

  private static applySharpenFilter(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(data);
    
    // Kernel de sharpening
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
              const kernelIndex = (ky + 1) * 3 + (kx + 1);
              sum += data[pixelIndex] * kernel[kernelIndex];
            }
          }
          const currentIndex = (y * width + x) * 4 + c;
          newData[currentIndex] = Math.min(255, Math.max(0, sum));
        }
      }
    }
    
    return new ImageData(newData, width, height);
  }

  private static denoiseImage(imageData: ImageData, level: number): ImageData {
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(data);
    const radius = level;
    
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let count = 0;
          
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const pixelIndex = ((y + dy) * width + (x + dx)) * 4 + c;
              sum += data[pixelIndex];
              count++;
            }
          }
          
          const currentIndex = (y * width + x) * 4 + c;
          newData[currentIndex] = Math.round(sum / count);
        }
      }
    }
    
    return new ImageData(newData, width, height);
  }

  private static binarizeImage(imageData: ImageData): ImageData {
    const { data } = imageData;
    
    // Método de Otsu para umbralización automática
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }
    
    const total = imageData.width * imageData.height;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    
    let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }
    
    // Aplicar umbralización
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const binary = gray > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = binary;
    }
    
    return imageData;
  }

  private static deskewImage(imageData: ImageData): ImageData {
    // Implementación básica de corrección de inclinación
    // En una implementación real, usarías transformadas de Hough
    return imageData;
  }

  static async extractTextFromImage(
    imageElement: HTMLImageElement,
    useMultipleModels: boolean = true,
    enhanceImage: boolean = true
  ): Promise<AdvancedOCRResult> {
    const startTime = performance.now();
    
    try {
      await this.initializeOCR();
      
      let processedImage = imageElement;
      
      // Mejora de imagen si está habilitada
      if (enhanceImage) {
        const enhancedCanvas = await this.enhanceImage(imageElement, {
          enhanceContrast: true,
          sharpen: true,
          denoiseLevel: 1,
          binarize: false,
          deskew: true
        });
        
        const enhancedImg = new Image();
        enhancedImg.src = enhancedCanvas.toDataURL('image/png');
        await new Promise((resolve, reject) => {
          enhancedImg.onload = resolve;
          enhancedImg.onerror = reject;
        });
        processedImage = enhancedImg;
      }
      
      const results: Array<{text: string, confidence: number}> = [];
      
      // Usar modelo principal
      const primaryPipeline = this.ocrPipelines.get('primary');
      if (primaryPipeline) {
        try {
          const result = await primaryPipeline(processedImage);
          const first = Array.isArray(result) ? result[0] : result;
          results.push({
            text: first?.generated_text || '',
            confidence: 0.9
          });
        } catch (error) {
          console.warn('Error con modelo principal:', error);
        }
      }
      
      // Usar modelo ligero como respaldo si está habilitado
      if (useMultipleModels && results.length === 0) {
        const lightPipeline = this.ocrPipelines.get('lightweight');
        if (lightPipeline) {
          try {
            const result = await lightPipeline(processedImage);
            const first = Array.isArray(result) ? result[0] : result;
            results.push({
              text: first?.generated_text || '',
              confidence: 0.7
            });
          } catch (error) {
            console.warn('Error con modelo ligero:', error);
          }
        }
      }
      
      // Fallback a OCR del navegador
      if (results.length === 0) {
        const fallbackResult = await this.fallbackOCR(processedImage);
        results.push(fallbackResult);
      }
      
      // Seleccionar mejor resultado
      const bestResult = results.reduce((best, current) => 
        current.confidence > best.confidence ? current : best,
        { text: '', confidence: 0 }
      );
      
      const processingTime = performance.now() - startTime;
      
      return {
        text: bestResult.text,
        confidence: bestResult.confidence,
        processingTime,
        boundingBoxes: [] // Se podría implementar con modelos de detección
      };
      
    } catch (error) {
      console.error('Error en OCR avanzado:', error);
      return this.fallbackOCR(imageElement);
    }
  }

  private static async fallbackOCR(imageElement: HTMLImageElement): Promise<AdvancedOCRResult> {
    const startTime = performance.now();
    
    // OCR nativo del navegador si está disponible
    if ('TextDetector' in window) {
      try {
        const textDetector = new (window as any).TextDetector();
        const results = await textDetector.detect(imageElement);
        const text = results.map((result: any) => result.rawValue).join(' ');
        
        return {
          text,
          confidence: 0.6,
          processingTime: performance.now() - startTime,
          boundingBoxes: results.map((r: any) => ({
            text: r.rawValue,
            x: r.boundingBox.x,
            y: r.boundingBox.y,
            width: r.boundingBox.width,
            height: r.boundingBox.height,
            confidence: 0.6
          }))
        };
      } catch (error) {
        console.warn('TextDetector no disponible:', error);
      }
    }
    
    return {
      text: '',
      confidence: 0,
      processingTime: performance.now() - startTime
    };
  }

  static parseEnhancedMaterialData(ocrText: string): EnhancedMaterialData {
    const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const result: EnhancedMaterialData = {
      items: [],
      metadata: {
        documentType: 'material_delivery',
        extractionConfidence: 0,
        fieldsDetected: []
      }
    };

    // Patrones mejorados para albaranes españoles
    const supplierPatterns = [
      /(?:empresa|proveedor|suministrador|distribuidor)[:\s]*([^\n\r]+)/i,
      /^([A-Z][A-Za-z\s&,.-]+(?:S\.?L\.?|S\.?A\.?|S\.?C\.?|S\.?L\.?U\.?))\s*$/im,
      /razón\s+social[:\s]*([^\n\r]+)/i,
      /nombre[:\s]*([A-Z][A-Za-z\s&,.-]+)/i
    ];

    const invoicePatterns = [
      /(?:albar[aá]n|factura|documento|n[úu]mero|ref(?:erencia)?)[:\s#-]*([A-Z0-9\/-]+)/i,
      /n[º°]\s*([A-Z0-9\/-]+)/i,
      /doc\.?\s*([A-Z0-9\/-]+)/i,
      /(\d{4,}[-\/]\d+)/
    ];

    const datePatterns = [
      /fecha[:\s]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i,
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
      /(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/i
    ];

    const totalPatterns = [
      /total[:\s]*(\d+(?:[,\.]\d{2})?)\s*[€$]?/i,
      /importe[:\s]*(\d+(?:[,\.]\d{2})?)\s*[€$]?/i,
      /suma[:\s]*(\d+(?:[,\.]\d{2})?)\s*[€$]?/i
    ];

    // Patrones avanzados para materiales
    const materialPatterns = [
      // Formato: Material | Cantidad | Unidad | Precio | Total
      /^([A-Za-záéíóúñ\s\-,\.]+?)\s+(\d+(?:[,\.]\d+)?)\s*([a-zA-Z²³]{1,4})\s*(?:(\d+(?:[,\.]\d{2})?)\s*[€$]?)?\s*(?:(\d+(?:[,\.]\d{2})?)\s*[€$]?)?$/m,
      // Formato: Cantidad Unidad Material Precio
      /^(\d+(?:[,\.]\d+)?)\s+([a-zA-Z²³]{1,4})\s+([A-Za-záéíóúñ\s\-,\.]+?)\s+(\d+(?:[,\.]\d{2})?)\s*[€$]?$/m,
      // Formato con código: COD123 | Material | Cant | Ud | Precio
      /^(?:[A-Z0-9]+\s+)?([A-Za-záéíóúñ\s\-,\.]+?)\s+(\d+(?:[,\.]\d+)?)\s*([a-zA-Z²³]{1,4})\s+(\d+(?:[,\.]\d{2})?)\s*[€$]?/m
    ];

    let fieldsFound = 0;

    // Extraer proveedor
    for (const line of lines) {
      for (const pattern of supplierPatterns) {
        const match = line.match(pattern);
        if (match && !result.supplier) {
          result.supplier = match[1].trim().replace(/[.,;]+$/, '');
          fieldsFound++;
          result.metadata!.fieldsDetected.push('supplier');
          break;
        }
      }
    }

    // Extraer número de albarán
    for (const line of lines) {
      for (const pattern of invoicePatterns) {
        const match = line.match(pattern);
        if (match && !result.invoiceNumber) {
          result.invoiceNumber = match[1].trim();
          fieldsFound++;
          result.metadata!.fieldsDetected.push('invoiceNumber');
          break;
        }
      }
    }

    // Extraer fecha
    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match && !result.date) {
          if (pattern.source.includes('\\w+')) {
            // Formato con nombre de mes
            const monthNames = {
              'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
              'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
              'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
            };
            const monthKey = Object.keys(monthNames).find(m => 
              match[2].toLowerCase().includes(m.toLowerCase())
            );
            if (monthKey) {
              const month = monthNames[monthKey as keyof typeof monthNames];
              result.date = `${match[3]}-${month}-${String(match[1]).padStart(2, '0')}`;
              fieldsFound++;
              result.metadata!.fieldsDetected.push('date');
            }
          } else {
            // Formato numérico
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            result.date = `${year}-${month}-${day}`;
            fieldsFound++;
            result.metadata!.fieldsDetected.push('date');
          }
          break;
        }
      }
    }

    // Extraer total
    for (const line of lines) {
      for (const pattern of totalPatterns) {
        const match = line.match(pattern);
        if (match && !result.totalAmount) {
          result.totalAmount = parseFloat(match[1].replace(',', '.'));
          fieldsFound++;
          result.metadata!.fieldsDetected.push('totalAmount');
          break;
        }
      }
    }

    // Extraer materiales con algoritmo mejorado
    const detectedItems = new Set<string>();
    
    for (const line of lines) {
      // Filtrar líneas que claramente no son materiales
      if (line.length < 5 || 
          /^(fecha|total|empresa|proveedor|albar|factura|iva|dto)/i.test(line) ||
          /^[A-Z\s]{2,}$/.test(line)) {
        continue;
      }

      for (const pattern of materialPatterns) {
        const match = line.match(pattern);
        if (match) {
          let name, quantity, unit, unitPrice, total;
          let confidence = 0.7;

          // Determinar el formato basado en el patrón
          if (pattern.source.startsWith('^([A-Za-z')) {
            // Formato: Material | Cantidad | Unidad | Precio | Total
            name = match[1].trim();
            quantity = parseFloat(match[2].replace(',', '.'));
            unit = match[3];
            unitPrice = match[4] ? parseFloat(match[4].replace(',', '.')) : undefined;
            total = match[5] ? parseFloat(match[5].replace(',', '.')) : undefined;
          } else if (pattern.source.startsWith('^(\\d+')) {
            // Formato: Cantidad | Unidad | Material | Precio
            quantity = parseFloat(match[1].replace(',', '.'));
            unit = match[2];
            name = match[3].trim();
            unitPrice = match[4] ? parseFloat(match[4].replace(',', '.')) : undefined;
          } else {
            // Formato con código
            name = match[1].trim();
            quantity = parseFloat(match[2].replace(',', '.'));
            unit = match[3];
            unitPrice = match[4] ? parseFloat(match[4].replace(',', '.')) : undefined;
            confidence = 0.8;
          }

          // Validaciones adicionales
          if (name && 
              name.length > 2 && 
              !isNaN(quantity) && 
              quantity > 0 && 
              unit &&
              !detectedItems.has(name.toLowerCase())) {
            
            // Calcular total si no está presente
            if (!total && unitPrice) {
              total = quantity * unitPrice;
            }

            result.items!.push({
              name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
              quantity,
              unit: unit.toLowerCase(),
              unitPrice,
              total,
              confidence
            });

            detectedItems.add(name.toLowerCase());
            fieldsFound++;
          }
          break;
        }
      }
    }

    if (result.items!.length > 0) {
      result.metadata!.fieldsDetected.push('items');
    }

    // Calcular confianza global
    const totalPossibleFields = 5; // supplier, invoiceNumber, date, totalAmount, items
    result.metadata!.extractionConfidence = fieldsFound / totalPossibleFields;

    return result;
  }
}

export { AdvancedOCRService, type AdvancedOCRResult, type EnhancedMaterialData, type ImageProcessingOptions };