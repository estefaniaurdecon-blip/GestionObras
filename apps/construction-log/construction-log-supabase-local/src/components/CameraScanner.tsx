import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Camera, X, RotateCcw, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

interface CameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageData: string, ocrData?: any) => void;
  title?: string;
  enableOCR?: boolean;
  ocrType?: 'material' | 'general';
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = "Escanear Documento",
  enableOCR = false,
  ocrType = 'general'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [documentFrame, setDocumentFrame] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const { toast } = useToast();
  const isNative = Capacitor.isNativePlatform();

  // RAF-based detection control to reduce flicker
  const detectRafRef = useRef<number | null>(null);
  const lastDetectTimeRef = useRef<number>(0);
  const prevFrameRef = useRef<{x: number; y: number; width: number; height: number} | null>(null);
  const lastUiUpdateRef = useRef<number>(0);
  const countdownRef = useRef<number>(0);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoStartRef = useRef<boolean>(false);
  const captureImageRef = useRef<(() => Promise<void>) | null>(null);

  // Camera devices
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const pickDefaultDevice = useCallback((devices: MediaDeviceInfo[]) => {
    if (!devices.length) return null;
    const badKeywords = ['droidcam', 'obs', 'ndi', 'ip camera', 'cam link', 'elgato', 'epoccam'];
    const goodKeywords = ['integrated', 'webcam', 'built-in', 'facetime', 'hd webcam', 'cámara', 'camara'];
    const byGood = devices.find(d => goodKeywords.some(k => d.label.toLowerCase().includes(k)));
    if (byGood) return byGood.deviceId;
    const notBad = devices.find(d => !badKeywords.some(k => d.label.toLowerCase().includes(k)));
    return (notBad || devices[0]).deviceId;
  }, []);


  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      // En entornos nativos, usar Capacitor Camera
      if (Capacitor.isNativePlatform()) {
        try {
          const image = await CapacitorCamera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Camera,
            saveToGallery: false,
          });
          
          // DataUrl ya viene como base64 data URL (data:image/jpeg;base64,...)
          const dataUrl = image.dataUrl || '';
          if (dataUrl) {
            // Solo guardar la imagen, NO cerrar el modal
            // El usuario verá la imagen capturada y podrá confirmar con "Guardar"
            setCapturedImage(dataUrl);
          } else {
            // Si no hay imagen, cerrar el modal
            onClose();
          }
          return;
        } catch (err: any) {
          console.error('Error con Capacitor Camera:', err);
          // Si el usuario canceló, simplemente cerrar sin error
          if (err?.message?.includes('cancelled') || err?.message?.includes('canceled') || err?.code === 'CANCELLED') {
            onClose();
            return;
          }
          toast({ 
            title: 'Error de cámara', 
            description: 'No se pudo acceder a la cámara del dispositivo.', 
            variant: 'destructive' 
          });
          onClose();
          return;
        }
      }

      // Fallback para navegadores web
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
        toast({ title: 'Cámara no soportada', description: 'getUserMedia no está disponible en este entorno.', variant: 'destructive' });
        return;
      }
      if (!window.isSecureContext) {
        console.warn('Contexto no seguro: getUserMedia requiere HTTPS');
        toast({
          title: "Cámara bloqueada",
          description: "El navegador requiere HTTPS para usar la cámara.",
          variant: "destructive",
        });
        return;
      }

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      const buildConstraints = (v: MediaTrackConstraints): MediaStreamConstraints => ({
        video: {
          ...v,
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          frameRate: { ideal: 30, min: 15 },
        },
        audio: false,
      });

      let mediaStream: MediaStream | null = null;
      try {
        const primary: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId } }
          : (isMobile ? { facingMode: { ideal: 'environment' } } : { facingMode: 'user' });
        mediaStream = await navigator.mediaDevices.getUserMedia(buildConstraints(primary));
      } catch (e1) {
        console.warn('getUserMedia primary falló, intentando fallback...', e1);
        try {
          if (deviceId) {
            mediaStream = await navigator.mediaDevices.getUserMedia(
              buildConstraints({ deviceId })
            );
          }
        } catch (e2) {
          console.warn('getUserMedia por deviceId simple falló, intentando { video: true }...', e2);
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      if (!mediaStream) throw new Error('No se pudo obtener el stream de la cámara');

      if (videoRef.current) {
        const videoEl = videoRef.current;
        // Asegurar políticas de autoplay
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.setAttribute('muted', 'true');
        videoEl.setAttribute('autoplay', 'true');
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('webkit-playsinline', 'true');

        videoEl.srcObject = mediaStream;

        const onLoadedMeta = async () => {
          try { await videoEl.play(); } catch (err) { console.warn('Reproducción bloqueada:', err); }
        };
        if (videoEl.readyState >= 1) { // HAVE_METADATA
          try { await videoEl.play(); } catch (err) { console.warn('play() falló:', err); }
        } else {
          videoEl.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
        }

        mediaStream.getVideoTracks().forEach((t) => {
          t.onended = () => {
            console.warn('Pista de video finalizada, reiniciando cámara...');
            setTimeout(() => { startCamera(deviceId); }, 100);
          };
        });

        setStream(mediaStream);
      }
    } catch (error: any) {
      console.error('Error accediendo a la cámara:', error);
      let description = 'No se pudo acceder a la cámara. Asegúrate de dar permisos.';
      if (error?.name === 'NotAllowedError') description = 'Permiso denegado para la cámara.';
      if (error?.name === 'NotFoundError') description = 'No se encontró ninguna cámara disponible.';
      toast({ title: 'Error de cámara', description, variant: 'destructive' });
    }
  }, [toast, onClose]);


  const enumerateAndStart = useCallback(async () => {
    try {
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
        toast({ title: 'Cámara no soportada', description: 'Este dispositivo no permite cámara en modo WebView.', variant: 'destructive' });
        return;
      }
      let devices = await navigator.mediaDevices.enumerateDevices();
      if (devices.filter(d => d.kind === 'videoinput').every(d => !d.label)) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tmp.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // ignore
        }
      }
      const vids = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(vids);
      const preferred = pickDefaultDevice(vids);
      setSelectedDeviceId(prev => prev ?? preferred);
      await startCamera(preferred || undefined);
    } catch (e) {
      await startCamera();
    }
  }, [pickDefaultDevice, startCamera, toast]);


  const stopCamera = useCallback(() => {
    // Cancelar RAF de detección
    if (detectRafRef.current) {
      cancelAnimationFrame(detectRafRef.current);
      detectRafRef.current = null;
    }

    // Cancelar countdown
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // Obtener el stream activo
    const videoEl = videoRef.current;
    const activeStream = (videoEl?.srcObject as MediaStream | null) || stream;

    // Detener todas las pistas del stream
    if (activeStream) {
      const tracks = activeStream.getTracks();
      tracks.forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {
          console.warn('Error deteniendo pista:', e);
        }
      });
      setStream(null);
    }

    // Limpiar el elemento de video
    if (videoEl) {
      try {
        videoEl.pause();
        videoEl.srcObject = null;
        videoEl.removeAttribute('src');
        videoEl.load();
      } catch (e) {
        console.warn('Error limpiando video:', e);
      }
    }

    // Limpiar overlay
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ovCtx = overlay.getContext('2d');
      if (ovCtx) {
        try {
          ovCtx.clearRect(0, 0, overlay.width, overlay.height);
        } catch (e) {
          console.warn('Error limpiando overlay:', e);
        }
      }
    }

    // Limpiar canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        } catch (e) {
          console.warn('Error limpiando canvas:', e);
        }
      }
    }

    // Limpiar referencias
    prevFrameRef.current = null;
    lastDetectTimeRef.current = 0;
    lastUiUpdateRef.current = 0;
    countdownRef.current = 0;
    autoStartRef.current = false;
  }, [stream]);

  // Document detection function
  const detectDocument = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Ensure canvas matches video dimensions only when needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw current frame
    context.drawImage(video, 0, 0);

    // Simple edge detection for document boundaries
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale and find edges
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    const threshold = 50;
    
    for (let y = 0; y < canvas.height; y += 10) {
      for (let x = 0; x < canvas.width; x += 10) {
        const i = (y * canvas.width + x) * 4;
        const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        // Look for edges (significant brightness changes)
        if (x > 0 && y > 0) {
          const prevI = (y * canvas.width + (x - 10)) * 4;
          const prevGray = (data[prevI] + data[prevI + 1] + data[prevI + 2]) / 3;
          
          if (Math.abs(gray - prevGray) > threshold) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }

    // Build candidate frame
    let nextFrame: { x: number; y: number; width: number; height: number };
    let documentDetected = false;
    
    if (maxX > minX && maxY > minY && (maxX - minX) > canvas.width * 0.2 && (maxY - minY) > canvas.height * 0.2) {
      const padding = 20;
      nextFrame = {
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        width: Math.min(canvas.width - minX + padding, maxX - minX + padding * 2),
        height: Math.min(canvas.height - minY + padding, maxY - minY + padding * 2)
      };
      documentDetected = true;
    } else {
      nextFrame = {
        x: canvas.width * 0.1,
        y: canvas.height * 0.1,
        width: canvas.width * 0.8,
        height: canvas.height * 0.8
      };
    }

    // Only update ref if the frame changed meaningfully to avoid re-renders and flicker
    const prev = prevFrameRef.current;
    const delta = prev
      ? Math.abs(nextFrame.x - prev.x) + Math.abs(nextFrame.y - prev.y) + Math.abs(nextFrame.width - prev.width) + Math.abs(nextFrame.height - prev.height)
      : Infinity;
    const thresholdDelta = (canvas.width + canvas.height) * 0.01; // 1% total delta
    if (!prev || delta > thresholdDelta) {
      prevFrameRef.current = nextFrame;
      // Do not set state here to prevent React re-renders that can cause flicker
    }

    // Auto-capture countdown cuando documento es estable
    if (documentDetected && delta < thresholdDelta && prev) {
      if (!autoStartRef.current) {
        // Iniciar countdown de 3 segundos
        autoStartRef.current = true;
        countdownRef.current = 3;
        
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
        
        countdownTimerRef.current = setInterval(() => {
          countdownRef.current -= 1;
          
          if (countdownRef.current <= 0) {
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            autoStartRef.current = false;
            // Disparar captura automática
            if (captureImageRef.current) {
              captureImageRef.current();
            }
          }
        }, 1000);
      }
    } else if (!documentDetected || delta >= thresholdDelta) {
      // Cancelar countdown si el documento se mueve o desaparece
      if (autoStartRef.current && countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        autoStartRef.current = false;
        countdownRef.current = 0;
      }
    }

    // Draw overlay on a dedicated canvas to avoid React re-renders
    const overlay = overlayCanvasRef.current;
    const videoEl = videoRef.current;
    if (overlay && videoEl) {
      const ovCtx = overlay.getContext('2d');
      if (ovCtx && videoEl.videoWidth && videoEl.videoHeight) {
        const dispW = videoEl.clientWidth;
        const dispH = videoEl.clientHeight;
        if (dispW && dispH) {
          if (overlay.width !== dispW || overlay.height !== dispH) {
            overlay.width = dispW;
            overlay.height = dispH;
          }
          const sx = dispW / videoEl.videoWidth;
          const sy = dispH / videoEl.videoHeight;
          const rx = nextFrame.x * sx;
          const ry = nextFrame.y * sy;
          const rw = nextFrame.width * sx;
          const rh = nextFrame.height * sy;

          ovCtx.clearRect(0, 0, dispW, dispH);
          ovCtx.save();
          ovCtx.strokeStyle = 'rgba(16,185,129,0.9)';
          ovCtx.fillStyle = 'rgba(16,185,129,0.08)';
          ovCtx.lineWidth = 2;

          // Highlight area
          ovCtx.fillRect(rx, ry, rw, rh);
          ovCtx.strokeRect(rx, ry, rw, rh);

          // Corner guides
          const g = 12;
          ovCtx.beginPath();
          // top-left
          ovCtx.moveTo(rx, ry + g);
          ovCtx.lineTo(rx, ry);
          ovCtx.lineTo(rx + g, ry);
          // top-right
          ovCtx.moveTo(rx + rw - g, ry);
          ovCtx.lineTo(rx + rw, ry);
          ovCtx.lineTo(rx + rw, ry + g);
          // bottom-left
          ovCtx.moveTo(rx, ry + rh - g);
          ovCtx.lineTo(rx, ry + rh);
          ovCtx.lineTo(rx + g, ry + rh);
          // bottom-right
          ovCtx.moveTo(rx + rw - g, ry + rh);
          ovCtx.lineTo(rx + rw, ry + rh);
          ovCtx.lineTo(rx + rw, ry + rh - g);
          ovCtx.stroke();

          // Label + countdown
          ovCtx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial';
          ovCtx.fillStyle = 'rgba(0,0,0,0.6)';
          const labelBase = 'Documento detectado';
          const pad = 6;
          const label = countdownRef.current ? `${labelBase} • ${countdownRef.current}s` : labelBase;
          const textW = ovCtx.measureText(label).width;
          const lx = rx;
          const ly = Math.max(ry - 10, 14);
          ovCtx.fillRect(lx - pad, ly - 12, textW + pad * 2, 16);
          ovCtx.fillStyle = 'rgba(255,255,255,0.9)';
          ovCtx.fillText(label, lx, ly);
          ovCtx.restore();
        }
      }
    }
  }, []);

  // Run document detection with requestAnimationFrame to minimize flicker and sync to rendering
  useEffect(() => {
    if (!stream || capturedImage) return;

    let cancelled = false;
    const loop = (time: number) => {
      if (cancelled) return;
      if (time - lastDetectTimeRef.current > 250) { // throttle ~4 fps for lightweight detection
        detectDocument();
        lastDetectTimeRef.current = time;
      }
      detectRafRef.current = requestAnimationFrame(loop);
    };
    detectRafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (detectRafRef.current) cancelAnimationFrame(detectRafRef.current);
      detectRafRef.current = null;
    };
  }, [stream, capturedImage, detectDocument]);

  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    // Cancelar countdown si está activo
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    autoStartRef.current = false;
    countdownRef.current = 0;

    setIsCapturing(true);
    try {
      const video = videoRef.current;

      // Asegurar que el video está listo
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        try { await video.play(); } catch (_e) { /* play() puede fallar en algunos navegadores */ }
        await new Promise((r) => setTimeout(r, 120));
        if (!video.videoWidth || !video.videoHeight) {
          toast({
            title: "Cámara no lista",
            description: "No fue posible obtener el fotograma. Intenta de nuevo.",
            variant: "destructive",
          });
          return;
        }
      }

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        toast({
          title: "No se pudo capturar",
          description: "Contexto de canvas no disponible.",
          variant: "destructive",
        });
        return;
      }

      // Dimensiones del canvas según el video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Pintar el frame actual
      context.drawImage(video, 0, 0);

      // Recorte estable usando prevFrameRef
      let finalImageData: string;

      if (prevFrameRef.current) {
        const { x, y, width, height } = prevFrameRef.current;
        const cropCanvas = document.createElement('canvas');
        const cropContext = cropCanvas.getContext('2d');

        if (cropContext) {
          const cw = Math.max(1, Math.min(canvas.width, Math.round(width)));
          const ch = Math.max(1, Math.min(canvas.height, Math.round(height)));
          const cx = Math.max(0, Math.round(x));
          const cy = Math.max(0, Math.round(y));

          cropCanvas.width = cw;
          cropCanvas.height = ch;

          cropContext.drawImage(
            canvas,
            cx, cy, cw, ch,
            0, 0, cw, ch
          );

          // Mejora de contraste/brillo
          const imageData = cropContext.getImageData(0, 0, cw, ch);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.3 + 148));
            data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.3 + 148));
            data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.3 + 148));
          }

          cropContext.putImageData(imageData, 0, 0);
          finalImageData = cropCanvas.toDataURL('image/jpeg', 0.9);
        } else {
          finalImageData = canvas.toDataURL('image/jpeg', 0.8);
        }
      } else {
        finalImageData = canvas.toDataURL('image/jpeg', 0.8);
      }

      setCapturedImage(finalImageData);
    } catch (e) {
      console.error('Captura fallida:', e);
      toast({
        title: "Error al capturar",
        description: "Inténtalo nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

  // Actualizar ref para auto-captura
  useEffect(() => {
    captureImageRef.current = captureImage;
  }, [captureImage]);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setDocumentFrame(null);
  }, []);

  const saveImage = useCallback(async () => {
    if (!capturedImage) return;
    
    try {
      let ocrData = null;
      
      if (enableOCR && ocrType === 'material') {
        setIsProcessingOCR(true);
        
        try {
          // Import OCR service dynamically
          const { OCRService } = await import('@/utils/ocrService');
          
          // Create image element from captured data
          const img = new Image();
          img.src = capturedImage;
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          
          // Extract text using OCR
          const ocrResult = await OCRService.extractTextFromImage(img);
          
          if (ocrResult.text) {
            // Parse material data from OCR text
            ocrData = OCRService.parseMaterialData(ocrResult.text);
            
            toast({
              title: "OCR completado",
              description: `Texto extraído: ${ocrResult.confidence > 0.7 ? 'Alta confianza' : 'Confianza media'}`,
            });
          }
        } catch (error) {
          console.error('Error en OCR:', error);
          toast({
            title: "Error en OCR",
            description: "No se pudo extraer texto de la imagen",
            variant: "destructive",
          });
        } finally {
          setIsProcessingOCR(false);
        }
      }
      
      onCapture(capturedImage, ocrData);
      setCapturedImage(null);
      onClose();
    } catch (error) {
      console.error('Error guardando imagen:', error);
      toast({
        title: "Error",
        description: "No se pudo procesar la imagen",
        variant: "destructive",
      });
    }
  }, [capturedImage, onCapture, onClose, enableOCR, ocrType, toast]);

  const handleClose = useCallback(() => {
    try {
      stopCamera();
      setCapturedImage(null);
      setDocumentFrame(null);
      setIsProcessingOCR(false);
      setIsCapturing(false);
    } catch (e) {
      console.warn('Error en cleanup:', e);
    } finally {
      onClose();
    }
  }, [stopCamera, onClose]);

  useEffect(() => {
    if (isOpen && !capturedImage) {
      const timer = setTimeout(() => {
        if (isNative) {
          // En plataformas nativas, abrir directamente la cámara del sistema
          startCamera();
        } else {
          // En web, inicializar getUserMedia y detección
          enumerateAndStart();
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
      };
    }
    
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setDocumentFrame(null);
    }
    
    return () => {
      if (!isOpen) {
        stopCamera();
      }
    };
  }, [isOpen, capturedImage, isNative, startCamera, enumerateAndStart, stopCamera]);

  useEffect(() => {
    if (!isOpen || !selectedDeviceId || capturedImage) return;
    const timer = setTimeout(() => {
      stopCamera();
      startCamera(selectedDeviceId);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [selectedDeviceId, isOpen, capturedImage]);

  useEffect(() => {
    const handler = () => {
      if (isOpen) {
        enumerateAndStart();
      }
    };
    if (navigator.mediaDevices && 'addEventListener' in navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handler);
    }
    return () => {
      if (navigator.mediaDevices && 'removeEventListener' in navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handler);
      }
    };
  }, [isOpen, enumerateAndStart]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Escáner de documento con detección de bordes y OCR. La cámara se apaga automáticamente al cerrar.
          </DialogDescription>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Cámara</span>
            <Select value={selectedDeviceId ?? ''} onValueChange={(v) => setSelectedDeviceId(v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Seleccionar cámara" />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {videoDevices.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Cámara'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {!capturedImage ? (
            isNative ? (
              <div className="h-96 grid place-items-center rounded-lg border border-border bg-muted/40">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Abriendo cámara del sistema...
                </div>
              </div>
            ) : (
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-96 object-contain"
                  disablePictureInPicture
                  style={{
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                    willChange: 'transform'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                {/* Canvas overlay for detection - avoids React re-renders */}
                <div className="absolute inset-0 pointer-events-none">
                  <canvas ref={overlayCanvasRef} className="w-full h-full" />
                </div>
              </div>
            )
          ) : (
            <div className="text-center">
              <img
                src={capturedImage}
                alt="Captured document"
                className="max-w-full h-auto max-h-96 mx-auto rounded-lg"
              />
            </div>
          )}

          <div className="flex justify-between items-center gap-2">
            <Button variant="outline" onClick={handleClose}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>

            <div className="flex gap-2">
              {capturedImage ? (
                <>
                  <Button variant="outline" onClick={retakePhoto}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Repetir
                  </Button>
                  <Button 
                    onClick={saveImage} 
                    disabled={isProcessingOCR}
                    className="min-w-[120px]"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isProcessingOCR ? 'Procesando OCR...' : 'Guardar'}
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={captureImage} 
                  disabled={isCapturing}
                  className="min-w-[120px]"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {isCapturing ? 'Capturando...' : 'Capturar'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};