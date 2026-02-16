import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Camera, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Eye, 
  Settings,
  Zap,
  Brain,
  ScanLine
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CameraScanner } from './CameraScanner';
import { EnhancedMaterialData, ImageProcessingOptions } from '@/utils/advancedOcrService';
import { supabase } from '@/integrations/supabase/client';
import { compressBase64Image, isValidBase64Image, estimateBase64SizeKB, optimizeForOCR } from '@/utils/imageCompression';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ProgressIndicator } from '@/components/ui/progress-indicator';
import { SuccessAnimation } from '@/components/ui/success-animation';

interface AdvancedMaterialScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onMaterialDataExtracted: (data: EnhancedMaterialData, imageData: string) => void;
  workId?: string;
  organizationId?: string;
  allReports?: any[];
  currentReportDate?: string;
  onDateBasedReportChange?: (reportId: string, materialGroups: any[]) => void;
  onCreateNewReport?: (args: { newReport: any; currentRemainingGroups: any[] }) => void;
  onReloadReports?: () => void;
}

export const AdvancedMaterialScanner: React.FC<AdvancedMaterialScannerProps> = ({
  isOpen,
  onClose,
  onMaterialDataExtracted,
  workId,
  organizationId,
  allReports = [],
  currentReportDate,
  onDateBasedReportChange,
  onCreateNewReport,
  onReloadReports
}) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [extractedData, setExtractedData] = useState<EnhancedMaterialData | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<{
    text: string;
    confidence: number;
    processingTime: number;
  } | null>(null);
  
  // Estados para detección automática
  const [isStabilizing, setIsStabilizing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [edgesDetected, setEdgesDetected] = useState(false);
  
  // Configuración avanzada
  const [advancedSettings, setAdvancedSettings] = useState({
    useMultipleModels: true,
    enhanceImage: true,
    autoDetectEdges: true,
    autoCapture: true,
    stabilizationTime: 3,
    processingOptions: {
      enhanceContrast: true,
      sharpen: true,
      denoiseLevel: 2,
      binarize: false,
      deskew: true
    } as ImageProcessingOptions
  });

  const { toast } = useToast();

  // Pasos de procesamiento para el indicador visual
  const processingSteps = [
    { label: 'Validando imagen', progress: 0 },
    { label: 'Optimizando para IA', progress: 10 },
    { label: 'Analizando con Gemini', progress: 20 },
    { label: 'Extrayendo datos', progress: 70 },
    { label: 'Validando información', progress: 90 },
    { label: 'Finalizando', progress: 95 }
  ];

  const [currentProcessingStep, setCurrentProcessingStep] = useState(0);

  const processImageWithAdvancedOCR = useCallback(async (imageData: string) => {
    setIsProcessing(true);
    setProcessingProgress(0);
    setCurrentProcessingStep(0);
    setProcessingStage('Inicializando análisis con IA...');

    try {
      // Validar formato de imagen
      setCurrentProcessingStep(0);
      if (!isValidBase64Image(imageData)) {
        throw new Error('Formato de imagen no válido');
      }

      setProcessingProgress(10);
      setCurrentProcessingStep(1);
      setProcessingStage('Optimizando imagen para Android...');

      // Comprimir y optimizar imagen para dispositivos móviles
      let optimizedImage = imageData;
      const originalSizeKB = estimateBase64SizeKB(imageData);
      console.log(`Tamaño original: ${originalSizeKB.toFixed(2)} KB`);

      // Comprimir solo si la imagen es muy grande (>800KB)
      if (originalSizeKB > 800) {
        optimizedImage = await compressBase64Image(imageData, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.85,
          targetSizeKB: 600
        });
        const compressedSizeKB = estimateBase64SizeKB(optimizedImage);
        console.log(`Imagen comprimida: ${compressedSizeKB.toFixed(2)} KB`);
        
        toast({
          title: "✨ Imagen optimizada",
          description: `Reducida de ${originalSizeKB.toFixed(0)}KB a ${compressedSizeKB.toFixed(0)}KB`,
          duration: 2000,
        });
      }

      // Mejorar contraste para OCR
      optimizedImage = await optimizeForOCR(optimizedImage);

      setProcessingProgress(20);
      setCurrentProcessingStep(2);
      setProcessingStage('Enviando a Gemini AI...');

      // Llamar a la edge function con Gemini (usar imagen optimizada)
      let functionData: any = null;
      let functionError: any = null;
      
      const startTime = Date.now();
      
      try {
        if (supabase && (supabase as any).functions) {
          const resp = await supabase.functions.invoke('analyze-invoice', {
            body: { 
              imageBase64: optimizedImage,
              workId: workId || null,
              organizationId: organizationId || null
            }
          });
          functionData = resp.data;
          functionError = resp.error;
        } else {
          throw new TypeError('Supabase client no disponible');
        }
      } catch (e) {
        // Fallback directo por URL completa
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-invoice`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            imageBase64: optimizedImage,
            workId: workId || null,
            organizationId: organizationId || null
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) {
          functionError = new Error(json?.error || `Error de función (${res.status})`);
        } else {
          functionData = json;
        }
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`Tiempo de análisis: ${processingTime}ms`);

      if (functionError) {
        console.error('Error calling analyze-invoice:', functionError);
        throw new Error(functionError.message || 'Error al analizar la imagen');
      }

      if (!functionData || !functionData.success) {
        console.error('Invalid response from analyze-invoice:', functionData);
        throw new Error(functionData?.error || 'No se pudo analizar el albarán');
      }

      setProcessingProgress(70);
      setCurrentProcessingStep(3);
      setProcessingStage('Procesando datos extraídos...');

      const extractedData = functionData.data;
      
      // Construir materialData compatible con EnhancedMaterialData
      const materialData: EnhancedMaterialData = {
        supplier: extractedData.supplier,
        invoiceNumber: extractedData.invoiceNumber,
        date: extractedData.date,
        items: extractedData.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice || 0,
          total: item.total || item.quantity * (item.unitPrice || 0),
          confidence: 0.9
        })),
        metadata: {
          documentType: 'Albarán',
          extractionConfidence: functionData.confidence || 0.9,
          fieldsDetected: ['supplier', 'invoiceNumber', 'date', 'items']
        }
      };

      setExtractedData(materialData);
      setOcrResults({
        text: `Proveedor: ${extractedData.supplier}\nAlbarán: ${extractedData.invoiceNumber}\nFecha: ${extractedData.date}`,
        confidence: functionData.confidence || 0.9,
        processingTime: processingTime
      });

      setProcessingProgress(90);
      setCurrentProcessingStep(4);
      setProcessingStage('Validando datos extraídos...');

      setProcessingProgress(100);
      setCurrentProcessingStep(5);
      setProcessingStage('¡Análisis completado!');

      // Buscar parte de trabajo por fecha si hay fecha detectada
      let targetReportId: string | null = null;
      let targetReportDate: string | null = null;
      
      if (materialData.date && allReports.length > 0 && onDateBasedReportChange) {
        const matchingReport = allReports.find(r => r.date === materialData.date);
        
        if (matchingReport) {
          targetReportId = matchingReport.id;
          targetReportDate = matchingReport.date;
          
          toast({
            title: "Parte correspondiente encontrado",
            description: `Se cargarán los datos en el parte del ${new Date(materialData.date).toLocaleDateString('es-ES')}`,
          });
        } else {
          toast({
            title: "Aviso: Fecha detectada",
            description: `No se encontró un parte para la fecha ${new Date(materialData.date).toLocaleDateString('es-ES')}. Los datos se cargarán en el parte actual.`,
            variant: "default",
          });
        }
      }

      toast({
        title: "🎉 ¡Análisis completado!",
        description: `Confianza: ${Math.round((functionData.confidence || 0.9) * 100)}% | Datos añadidos automáticamente`,
        duration: 3000,
      });

      // Añadir directamente al parte actual y esperar a que se complete
      await new Promise<void>((resolve) => {
        onMaterialDataExtracted(materialData, optimizedImage);
        // Esperar suficiente tiempo para que se completen todas las operaciones asíncronas:
        // - Actualización del estado en React
        // - Guardado en la base de datos
        // - Recarga de partes
        setTimeout(resolve, 1500);
      });

      // Cerrar el diálogo después de que todo se haya completado
      onClose();

      // Si en el futuro se quiere revisión manual, se puede usar handleConfirmExtraction
      // manteniendo el diálogo abierto.

    } catch (error) {
      console.error('Error en procesamiento con IA:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      
      // Mensajes específicos para Android
      let userMessage = errorMessage;
      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        userMessage = 'Error de conexión. Verifica tu conexión a Internet.';
      } else if (errorMessage.includes('timeout')) {
        userMessage = 'La conexión tardó demasiado. Intenta de nuevo.';
      }
      
      toast({
        title: "Error en análisis con IA",
        description: userMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [toast, onMaterialDataExtracted, onClose]);

  const handleCameraCapture = useCallback(async (imageData: string) => {
    // Recibimos la imagen ya capturada (y potencialmente recortada por la cámara)
    setCapturedImage(imageData);
    setIsCameraOpen(false);

    // Evitar detección/cuenta atrás posterior: la detección ocurre antes de la foto
    setIsStabilizing(false);
    setEdgesDetected(false);
    setCountdown(0);

    try {
      await processImageWithAdvancedOCR(imageData);
    } catch (e) {
      console.error('Error procesando imagen tras captura:', e);
    }
  }, [processImageWithAdvancedOCR]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Archivo inválido",
        description: "Por favor selecciona una imagen válida.",
        variant: "destructive",
      });
      return;
    }

    // Validar tamaño (máximo 20MB)
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Archivo muy grande",
        description: "El archivo debe ser menor a 20MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convertir a Data URL (base64) para que la función backend pueda leerla
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        setCapturedImage(dataUrl);
        await processImageWithAdvancedOCR(dataUrl);
      };
      reader.onerror = () => {
        toast({
          title: "Error al leer el archivo",
          description: "No se pudo cargar la imagen seleccionada.",
          variant: "destructive",
        });
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error('Error leyendo archivo:', e);
      toast({
        title: "Error al leer el archivo",
        description: "No se pudo cargar la imagen seleccionada.",
        variant: "destructive",
      });
    }
  }, [processImageWithAdvancedOCR, toast]);

  const handleConfirmExtraction = useCallback(() => {
    if (extractedData && capturedImage) {
      // Buscar si hay un parte correspondiente a la fecha detectada
      let targetReportId: string | null = null;
      let targetReportDate: string | null = null;
      
      if (extractedData.date && allReports.length > 0 && onDateBasedReportChange) {
        const matchingReport = allReports.find(r => r.date === extractedData.date);
        
        if (matchingReport) {
          targetReportId = matchingReport.id;
          targetReportDate = matchingReport.date;
        }
      }

      // Ingresar datos automáticamente
      if (targetReportId && onDateBasedReportChange) {
        // Cargar en el parte correspondiente a la fecha
        const targetReport = allReports.find(r => r.id === targetReportId);
        if (targetReport) {
          const newGroup = {
            id: crypto.randomUUID(),
            supplier: extractedData.supplier || '',
            invoiceNumber: extractedData.invoiceNumber || '',
            items: extractedData.items.map(item => ({
              id: crypto.randomUUID(),
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              total: item.total
            })),
            documentImage: capturedImage,
            extractedDate: extractedData.date
          };
          
          const updatedMaterialGroups = [...(targetReport.material_groups || []), newGroup];
          onDateBasedReportChange(targetReportId, updatedMaterialGroups);
          
          toast({
            title: "✓ Materiales añadidos",
            description: `Los materiales se han añadido al parte del ${new Date(targetReportDate!).toLocaleDateString('es-ES')}`,
          });
        }
      } else {
        // Cargar en el parte actual
        onMaterialDataExtracted(extractedData, capturedImage);
        
        toast({
          title: "✓ Albarán añadido",
          description: "Los datos se han agregado a la sección de materiales",
          duration: 3000,
        });
      }

      handleReset();
      onClose();
    }
  }, [extractedData, capturedImage, onMaterialDataExtracted, onClose, allReports, onDateBasedReportChange, toast]);

  const handleReset = useCallback(() => {
    setExtractedData(null);
    setCapturedImage(null);
    setOcrResults(null);
    setProcessingProgress(0);
    setProcessingStage('');
  }, []);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.8) return 'Alta';
    if (confidence >= 0.6) return 'Media';
    return 'Baja';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Escáner Inteligente de Albaranes
              <Badge variant="secondary" className="ml-2">
                <Zap className="h-3 w-3 mr-1" />
                Gemini AI
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="scan" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="scan">
                <ScanLine className="h-4 w-4 mr-2" />
                Escanear
              </TabsTrigger>
              <TabsTrigger value="results">
                <Eye className="h-4 w-4 mr-2" />
                Resultados
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="h-4 w-4 mr-2" />
                Configuración
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" 
                      onClick={() => setIsCameraOpen(true)}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Camera className="h-5 w-5" />
                      Usar Cámara
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Captura el albarán directamente con la cámara. 
                      Gemini AI extraerá automáticamente todos los datos.
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Subir Imagen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label 
                      htmlFor="file-upload"
                      className="block text-sm text-muted-foreground cursor-pointer"
                    >
                      Selecciona una imagen desde tu dispositivo.
                      Formatos soportados: JPG, PNG, WEBP.
                    </label>
                  </CardContent>
                </Card>
              </div>

              {(isProcessing || isStabilizing) && (
                <Card className="animate-fade-in">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      {isStabilizing ? (
                        <>
                          <div className="flex items-center gap-2">
                            {edgesDetected ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <LoadingSpinner size="sm" />
                            )}
                            <span className="text-sm font-medium">
                              {edgesDetected ? 'Documento detectado' : 'Detectando bordes del documento...'}
                            </span>
                          </div>
                          {countdown > 0 && edgesDetected && (
                            <div className="text-center animate-scale-in">
                              <div className="text-4xl font-bold text-primary animate-pulse">
                                {countdown}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                Escaneando automáticamente...
                              </p>
                            </div>
                          )}
                         </>
                      ) : (
                        <ProgressIndicator
                          steps={processingSteps}
                          currentStep={currentProcessingStep}
                          currentProgress={processingProgress}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              {extractedData ? (
                <div className="space-y-4">
                  {/* Imagen capturada */}
                  {capturedImage && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Imagen Procesada</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <img 
                          src={capturedImage} 
                          alt="Albarán capturado"
                          className="max-h-48 rounded-lg border"
                        />
                      </CardContent>
                    </Card>
                  )}

                  {/* Información de AI */}
                  {ocrResults && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Brain className="h-4 w-4" />
                          Análisis con Gemini AI
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">Confianza:</span>
                          <Badge className={getConfidenceColor(ocrResults.confidence)}>
                            {getConfidenceText(ocrResults.confidence)} ({Math.round(ocrResults.confidence * 100)}%)
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tiempo de procesamiento: {Math.round(ocrResults.processingTime)}ms
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Datos extraídos */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Datos Extraídos
                        <Badge variant="outline">
                          {extractedData.metadata?.fieldsDetected.length || 0} campos detectados
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {extractedData.supplier && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                          <p className="text-sm">{extractedData.supplier}</p>
                        </div>
                      )}
                      
                      {extractedData.invoiceNumber && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Nº Albarán</label>
                          <p className="text-sm">{extractedData.invoiceNumber}</p>
                        </div>
                      )}
                      
                      {extractedData.date && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Fecha</label>
                          <p className="text-sm">{extractedData.date}</p>
                        </div>
                      )}

                      {extractedData.items && extractedData.items.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Materiales ({extractedData.items.length})
                          </label>
                          <div className="space-y-2 mt-2">
                            {extractedData.items.map((item, index) => (
                              <div key={index} className="bg-muted p-2 rounded text-xs">
                                <div className="font-medium">{item.name}</div>
                                <div className="text-muted-foreground">
                                  {item.quantity} {item.unit}
                                  {item.unitPrice && ` • ${item.unitPrice}€/ud`}
                                  {item.total && ` • Total: ${item.total}€`}
                                </div>
                                <Badge 
                                  className={`mt-1 text-xs ${getConfidenceColor(item.confidence)}`}
                                >
                                  {Math.round(item.confidence * 100)}%
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {extractedData.totalAmount && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Total</label>
                          <p className="text-sm font-medium">{extractedData.totalAmount}€</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex gap-2">
                    <Button onClick={handleConfirmExtraction} className="flex-1">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Usar Estos Datos
                    </Button>
                    <Button variant="outline" onClick={handleReset}>
                      Escanear Otro
                    </Button>
                  </div>
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      No hay resultados aún. Escanea un albarán para ver los datos extraídos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuración de OCR</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Detección automática de bordes</label>
                      <p className="text-xs text-muted-foreground">Recorta automáticamente el documento</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={advancedSettings.autoDetectEdges}
                      onChange={(e) => setAdvancedSettings(prev => ({
                        ...prev,
                        autoDetectEdges: e.target.checked
                      }))}
                      className="rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Captura automática</label>
                      <p className="text-xs text-muted-foreground">Escanea tras estabilización</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={advancedSettings.autoCapture}
                      onChange={(e) => setAdvancedSettings(prev => ({
                        ...prev,
                        autoCapture: e.target.checked
                      }))}
                      className="rounded"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Tiempo de estabilización: {advancedSettings.stabilizationTime}s
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={advancedSettings.stabilizationTime}
                      onChange={(e) => setAdvancedSettings(prev => ({
                        ...prev,
                        stabilizationTime: parseInt(e.target.value)
                      }))}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Usar múltiples modelos</label>
                    <input
                      type="checkbox"
                      checked={advancedSettings.useMultipleModels}
                      onChange={(e) => setAdvancedSettings(prev => ({
                        ...prev,
                        useMultipleModels: e.target.checked
                      }))}
                      className="rounded"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Mejorar imagen automáticamente</label>
                    <input
                      type="checkbox"
                      checked={advancedSettings.enhanceImage}
                      onChange={(e) => setAdvancedSettings(prev => ({
                        ...prev,
                        enhanceImage: e.target.checked
                      }))}
                      className="rounded"
                    />
                  </div>
                </CardContent>
              </Card>

              {advancedSettings.enhanceImage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Opciones de Mejora de Imagen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Mejorar contraste</label>
                      <input
                        type="checkbox"
                        checked={advancedSettings.processingOptions.enhanceContrast}
                        onChange={(e) => setAdvancedSettings(prev => ({
                          ...prev,
                          processingOptions: {
                            ...prev.processingOptions,
                            enhanceContrast: e.target.checked
                          }
                        }))}
                        className="rounded"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Aplicar filtro de nitidez</label>
                      <input
                        type="checkbox"
                        checked={advancedSettings.processingOptions.sharpen}
                        onChange={(e) => setAdvancedSettings(prev => ({
                          ...prev,
                          processingOptions: {
                            ...prev.processingOptions,
                            sharpen: e.target.checked
                          }
                        }))}
                        className="rounded"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm">Nivel de reducción de ruido</label>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        value={advancedSettings.processingOptions.denoiseLevel}
                        onChange={(e) => setAdvancedSettings(prev => ({
                          ...prev,
                          processingOptions: {
                            ...prev.processingOptions,
                            denoiseLevel: Number(e.target.value)
                          }
                        }))}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground">
                        Actual: {advancedSettings.processingOptions.denoiseLevel}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <CameraScanner
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        title="Escanear Albarán"
        enableOCR={false} // Lo manejamos manualmente con el OCR avanzado
      />
    </>
  );
};