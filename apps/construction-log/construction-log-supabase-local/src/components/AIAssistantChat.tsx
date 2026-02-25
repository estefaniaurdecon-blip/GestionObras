import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HardHat, X, Send, Minimize2, Maximize2, Trash2, Image as ImageIcon, Maximize, FileDown, ChevronLeft, ChevronRight, History, Clock, Trash, Bell, AlertCircle, MoreVertical, FileText, BarChart3, TrendingUp, Users, Package, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WorkReport } from "@/types/workReport";
import { AccessReport } from "@/types/accessControl";
import type { Database } from '@/integrations/supabase/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { generateAIAnalysisPDF } from "@/utils/aiAnalysisPdfGenerator";
import { createPortal } from "react-dom";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useOrganization } from "@/hooks/useOrganization";
import { storage } from "@/utils/storage";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";

type InventoryItem = Database['public']['Tables']['work_inventory']['Row'];
// Configurar worker de PDF.js (compatible con Vite)
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc as unknown as string;

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // Base64 encoded images
}

interface SavedAnalysis {
  id: string;
  timestamp: number;
  messages: Message[];
  preview: string; // First user message or "Análisis de plano"
  userMessageIndex?: number; // Índice del último mensaje de usuario
}

interface AIAssistantChatProps {
  workReports: WorkReport[];
  advancedReportsData?: any; // Datos de informes avanzados para comparación
  accessReports?: AccessReport[]; // Datos de control de accesos
  inventory?: InventoryItem[]; // Datos de inventario
}

export const AIAssistantChat = ({ workReports, advancedReportsData, accessReports = [], inventory = [] }: AIAssistantChatProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [chatSize, setChatSize] = useState({ width: 450, height: 650 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [currentAnalysisIndex, setCurrentAnalysisIndex] = useState<number>(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);
  const [urgentTasks, setUrgentTasks] = useState<any[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]);
  const [isButtonEnabled, setIsButtonEnabled] = useState(true);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const [isButtonActive, setIsButtonActive] = useState(false);
  const [showPdfAnalysisMenu, setShowPdfAnalysisMenu] = useState(false);
  const pdfAnalysisInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  const { toast } = useToast();
  const { companySettings } = useCompanySettings();
  const { organization } = useOrganization();
  const tapTimeoutRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);

  const handleButtonTap = useCallback(() => {
    setIsButtonActive(true);
    
    // Reiniciar temporizador de inactividad
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = window.setTimeout(() => {
      setIsButtonActive(false);
    }, 3000);

    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = 0;
      setIsButtonEnabled((prev) => {
        const next = !prev;
        if (!next) setIsOpen(false);
        toast({
          title: next ? "Chat activado" : "Chat desactivado",
          description: next ? "Toca para abrir" : "Doble toque para volver a activar",
          duration: 2200,
        });
        return next;
      });
    } else {
      lastTapRef.current = now;
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      tapTimeoutRef.current = window.setTimeout(() => {
        if (isButtonEnabled) {
          setIsOpen(true);
        } else {
          toast({ title: "Chat desactivado", description: "Doble toque para activar", duration: 1600 });
        }
        tapTimeoutRef.current = null;
      }, 250);
    }
  }, [isButtonEnabled, toast]);

  // Detectar si estamos en Electron
  const isElectronApp = typeof window !== 'undefined' && 
    ((window as any).electronAPI !== undefined || 
     navigator.userAgent.toLowerCase().includes('electron'));

  // Clave fallback cuando la organización aún no está disponible (típico en Electron por timing)
  const PENDING_ANALYSES_KEY = 'ai_plan_analyses__pending';

  // Cargar análisis guardados al montar (específicos por organización)
  useEffect(() => {
    const loadSavedAnalyses = async () => {
      try {
        const orgKey = organization?.id ? `ai_plan_analyses_${organization.id}` : null;
        const primaryKey = orgKey ?? PENDING_ANALYSES_KEY;
        console.log(`[AIChat] Loading analyses from key: ${primaryKey}`);

        const saved = await storage.getItem(primaryKey);
        if (saved) {
          try {
            const analyses = JSON.parse(saved) as SavedAnalysis[];
            // Validar que sea un array y tenga estructura correcta
            if (Array.isArray(analyses)) {
              console.log(`[AIChat] Loaded ${analyses.length} saved analyses`);
              setSavedAnalyses(analyses);
            } else {
              console.warn('[AIChat] Saved data is not an array, resetting');
              setSavedAnalyses([]);
            }
          } catch (parseError) {
            console.error('[AIChat] Error parsing saved analyses:', parseError);
            // Si hay error de parsing, limpiar datos corruptos
            await storage.removeItem(primaryKey);
            setSavedAnalyses([]);
          }
        } else {
          console.log('[AIChat] No saved analyses found');

          // Si ya tenemos orgId, pero no hay nada en la clave principal, intentar migrar desde pending
          if (orgKey) {
            const pending = await storage.getItem(PENDING_ANALYSES_KEY);
            if (pending) {
              try {
                const analyses = JSON.parse(pending) as SavedAnalysis[];
                if (Array.isArray(analyses) && analyses.length > 0) {
                  console.log(`[AIChat] Migrating ${analyses.length} analyses from pending -> ${orgKey}`);
                  await storage.setItem(orgKey, pending);
                  await storage.removeItem(PENDING_ANALYSES_KEY);
                  setSavedAnalyses(analyses);
                }
              } catch (e) {
                // Si pending está corrupto, limpiarlo para evitar bucles
                console.warn('[AIChat] Pending analyses corrupted, removing');
                await storage.removeItem(PENDING_ANALYSES_KEY);
              }
            }
          }
        }
      } catch (error) {
        console.error('[AIChat] Error loading saved analyses:', error);
      }
    };
    
    // En Electron, esperar un poco más para asegurar que todo esté listo
    if (isElectronApp) {
      const timer = setTimeout(loadSavedAnalyses, 500);
      return () => clearTimeout(timer);
    } else {
      loadSavedAnalyses();
    }
  }, [organization?.id, isElectronApp]);

  // Mensaje de bienvenida personalizado al abrir el chat
  useEffect(() => {
    if (isOpen && messages.length === 0 && organization?.name) {
      const welcomeMessage: Message = {
        role: "assistant",
        content: `¡Bienvenido al Asistente de Construcción de **${organization.name}**! 👷‍♂️\n\nEstoy aquí para ayudarte con:\n\n- 📋 Análisis de planos y documentos de construcción\n- 📊 Consultas sobre partes de trabajo y recursos\n- 🔍 Información del inventario de materiales\n- 📈 Informes de control de accesos\n- 📅 **Recordatorios de tareas del calendario**\n- 💡 Cualquier pregunta relacionada con tus proyectos\n\n¿En qué puedo ayudarte hoy?`
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, organization?.name]);

  // Check for upcoming tasks
  const checkCalendarTasks = useCallback(async () => {
    // Legacy calendar checks depended on Supabase Edge Functions.
    // Keep task lists empty in DocInt-only mode to avoid runtime failures.
    setUrgentTasks([]);
    setUpcomingTasks([]);
  }, []);

  // Check if current time is within working hours (Spain time: Mon-Fri, 07:00-19:00)
  const isWorkingHours = useCallback(() => {
    const now = new Date();
    const spainTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const day = spainTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = spainTime.getHours();
    
    // Check if it's Monday-Friday (1-5) and between 07:00-19:00
    return day >= 1 && day <= 5 && hour >= 7 && hour < 19;
  }, []);

  // Check tasks every hour when chat is open and during working hours
  useEffect(() => {
    if (!isOpen) return;

    // Check immediately when opening if in working hours
    if (isWorkingHours()) {
      checkCalendarTasks();
    }
    
    const interval = setInterval(() => {
      if (isWorkingHours()) {
        checkCalendarTasks();
      }
    }, 60 * 60 * 1000); // Every hour

    return () => clearInterval(interval);
  }, [isOpen, checkCalendarTasks, isWorkingHours]);

useEffect(() => {
    if (scrollAreaRef.current && pendingScrollIndex === null) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, pendingScrollIndex]);

  // Desplazar a la pregunta seleccionada del historial
  useEffect(() => {
    if (pendingScrollIndex != null) {
      const idx = pendingScrollIndex;
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-message-index="${idx}"]`) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setPendingScrollIndex(null);
        }
      });
    }
  }, [messages, pendingScrollIndex]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !chatRef.current || isFullscreen) return;

      const rect = chatRef.current.getBoundingClientRect();
      
      if (resizeDirection === 'right') {
        const newWidth = Math.max(350, Math.min(window.innerWidth - 20, rect.right - e.clientX + chatSize.width));
        setChatSize(prev => ({ ...prev, width: newWidth }));
      } else if (resizeDirection === 'left') {
        const newWidth = Math.max(350, Math.min(window.innerWidth - 20, e.clientX - rect.left + chatSize.width));
        setChatSize(prev => ({ ...prev, width: newWidth }));
      } else if (resizeDirection === 'top') {
        const newHeight = Math.max(400, Math.min(window.innerHeight - 100, rect.bottom - e.clientY + chatSize.height));
        setChatSize(prev => ({ ...prev, height: newHeight }));
      } else if (resizeDirection === 'bottom') {
        const newHeight = Math.max(400, Math.min(window.innerHeight - 100, e.clientY - rect.top + chatSize.height));
        setChatSize(prev => ({ ...prev, height: newHeight }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeDirection, chatSize, isFullscreen]);

  const streamChat = async (userMessage: string, images?: string[]) => {
    const newMessages = [...messages, { 
      role: "user" as const, 
      content: userMessage,
      images: images 
    }];
    setMessages(newMessages);
    setIsLoading(true);
    setInput("");
    setSelectedImages([]);

    try {
      // Prepare ALL work reports context - NO LIMIT for accurate analysis
      // Send all reports to ensure 100% accuracy in calculations
      const allReports = workReports.map(report => ({
        id: report.id,
        workName: report.workName,
        workNumber: report.workNumber,
        date: report.date,
        foreman: report.foreman,
        foremanHours: Number(report.foremanHours) || 0,
        siteManager: report.siteManager,
        observations: report.observations,
        status: report.status,
        approved: report.approved,
        workGroups: (report.workGroups || []).map(g => ({
          company: g.company || 'Sin empresa',
          items: (g.items || []).map(item => ({
            name: item.name || '',
            activity: item.activity || '',
            hours: Number(item.hours) || 0,
            hourlyRate: Number(item.hourlyRate) || 0,
            total: Number(item.total) || 0,
          })),
        })),
        machineryGroups: (report.machineryGroups || []).map(g => ({
          company: g.company || 'Sin empresa',
          items: (g.items || []).map(item => ({
            type: item.type || '',
            activity: item.activity || '',
            hours: Number(item.hours) || 0,
            hourlyRate: Number(item.hourlyRate) || 0,
            total: Number(item.total) || 0,
          })),
        })),
        materialGroups: (report.materialGroups || []).map(g => ({
          supplier: g.supplier || 'Sin proveedor',
          invoiceNumber: g.invoiceNumber || '',
          items: (g.items || []).map(item => ({
            name: item.name || '',
            quantity: Number(item.quantity) || 0,
            unit: item.unit || '',
            unitPrice: Number(item.unitPrice) || 0,
            total: Number(item.total) || 0,
          })),
        })),
        subcontractGroups: (report.subcontractGroups || []).map(g => ({
          company: g.company || 'Sin empresa',
          items: (g.items || []).map(item => ({
            contractedPart: item.contractedPart || '',
            company: item.company || '',
            activity: item.activity || '',
            workers: Number(item.workers) || 0,
            hours: Number(item.hours) || 0,
            hourlyRate: Number(item.hourlyRate) || 0,
            total: Number(item.total) || 0,
            unitType: item.unitType || 'hora',
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unitPrice) || 0,
          })),
        })),
      }));
      
      console.log(`[AIAssistantChat] Sending ${allReports.length} work reports to AI for analysis`);

      const response = await fetch(
        `/api/v1/ai/construction-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: newMessages,
            workReportsContext: allReports,
            advancedReportsContext: advancedReportsData,
            accessControlContext: accessReports, // All access control reports
            inventoryContext: inventory.map(item => ({
              work_id: item.work_id,
              name: item.name,
              item_type: item.item_type,
              category: item.category,
              quantity: item.quantity,
              unit: item.unit,
              last_entry_date: item.last_entry_date,
              last_supplier: item.last_supplier,
              delivery_note_number: item.delivery_note_number,
              product_code: item.product_code,
              unit_price: item.unit_price,
              total_price: item.total_price,
              batch_number: item.batch_number,
              brand: item.brand,
              model: item.model,
              condition: item.condition,
              location: item.location,
              exit_date: item.exit_date,
              observations: item.observations,
              notes: item.notes
            })),
            calendarTasksContext: {
              urgentTasks,
              upcomingTasks,
              totalUrgent: urgentTasks.length,
              totalUpcoming: upcomingTasks.length
            }
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al conectar con el asistente");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      let assistantContent = "";

      // Add assistant message placeholder
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return newMessages;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Guardar análisis completo con la respuesta del asistente
      const finalMessages = [...newMessages, { role: "assistant" as const, content: assistantContent }];
      setMessages(finalMessages);
      await saveCurrentAnalysis(finalMessages);

      setIsLoading(false);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => prev.slice(0, -1));
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al enviar mensaje",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const saveCurrentAnalysis = async (conversationMessages: Message[]) => {
    try {
      // Encontrar el índice del último mensaje de usuario
      let lastUserMessageIndex = -1;
      for (let i = conversationMessages.length - 1; i >= 0; i--) {
        if (conversationMessages[i].role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }
      
      // Obtener preview del primer mensaje de usuario
      const firstUserMsg = conversationMessages.find(m => m.role === "user");
      const preview = firstUserMsg?.content.substring(0, 50) || "Análisis de plano";
      
      // Para el almacenamiento, eliminar imágenes base64 grandes para evitar 
      // problemas de espacio en localStorage (especialmente en Electron)
      // Mantener solo un marcador de que había imágenes
      const messagesForStorage = conversationMessages.map(msg => {
        if (msg.images && msg.images.length > 0) {
          return {
            ...msg,
            images: undefined, // No guardar imágenes base64 en historial
            hadImages: true, // Marcador de que tenía imágenes
            imageCount: msg.images.length
          };
        }
        return msg;
      });
      
      const newAnalysis: SavedAnalysis = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        messages: messagesForStorage as Message[],
        preview: preview + (firstUserMsg?.images?.length ? ` 📷(${firstUserMsg.images.length})` : ''),
        userMessageIndex: lastUserMessageIndex
      };

      const updatedAnalyses = [newAnalysis, ...savedAnalyses].slice(0, 50); // Guardar últimos 50
      setSavedAnalyses(updatedAnalyses);
      setCurrentAnalysisIndex(0);
      
      // Guardar con clave específica de la organización (o fallback si aún no se cargó)
      const storageKey = organization?.id ? `ai_plan_analyses_${organization.id}` : PENDING_ANALYSES_KEY;
      console.log(`[AIChat] Saving ${updatedAnalyses.length} analyses to key: ${storageKey}`);
      await storage.setItem(storageKey, JSON.stringify(updatedAnalyses));
      console.log('[AIChat] Analyses saved successfully');
    } catch (error) {
      console.error('[AIChat] Error saving analysis:', error);
      toast({
        title: "Error guardando historial",
        description: "No se pudo guardar el análisis en el historial",
        variant: "destructive",
      });
    }
  };

  const handleSend = () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading) return;
    streamChat(input || "Analiza esta imagen de plano de construcción", selectedImages.length > 0 ? selectedImages : undefined);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "Archivo demasiado grande",
          description: "Los archivos deben ser menores a 20MB",
          variant: "destructive",
        });
        return;
      }

      // Tipos soportados
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Formato no soportado",
          description: "Solo se permiten imágenes (JPG, PNG, WEBP) y archivos PDF",
          variant: "destructive",
        });
        return;
      }

      if (file.type === 'application/pdf') {
        (async () => {
          try {
            const buffer = await file.arrayBuffer();
            const loadingTask: any = (pdfjsLib as any).getDocument({ data: buffer });
            const pdf = await loadingTask.promise;
            const maxPages = Math.min(pdf.numPages, 5);
            
            toast({
              title: 'Procesando PDF',
              description: `Extrayendo ${maxPages} de ${pdf.numPages} página(s)...`,
            });

            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: ctx!, viewport }).promise;
              const dataUrl = canvas.toDataURL('image/png');
              setSelectedImages(prev => [...prev, dataUrl]);
            }
            
            toast({
              title: 'PDF procesado',
              description: `${maxPages} página(s) listas para análisis completo`,
            });
          } catch (err) {
            console.error('Error procesando PDF:', err);
            toast({ title: 'Error', description: 'No se pudo leer el PDF.', variant: 'destructive' });
          }
        })();
        return;
      }

      // Procesar imágenes normales
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setSelectedImages(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Consultas predefinidas para análisis de partes de trabajo
  const pdfAnalysisQueries = [
    {
      icon: BarChart3,
      label: "Resumen General",
      query: "Analiza este PDF y proporciona un resumen general de los datos que contiene, identificando: empresa, fecha, trabajadores, maquinaria, materiales y totales económicos.",
    },
    {
      icon: TrendingUp,
      label: "Comparativa",
      query: "Compara los datos de este PDF con los partes de trabajo guardados. Identifica diferencias significativas en horas, costes, personal o materiales.",
    },
    {
      icon: Users,
      label: "Personal y Horas",
      query: "Extrae toda la información sobre personal de este PDF: nombres, empresas, actividades, horas trabajadas y costes asociados.",
    },
    {
      icon: Package,
      label: "Materiales",
      query: "Lista todos los materiales que aparecen en este PDF: nombre, cantidad, unidad, precio unitario, total, proveedor y número de albarán.",
    },
    {
      icon: Calculator,
      label: "Análisis Económico",
      query: "Realiza un análisis económico detallado de este PDF: totales por categoría (mano de obra, maquinaria, materiales, subcontratas), porcentajes y comparativa con partes anteriores.",
    },
  ];

  // Manejar subida de PDF para análisis específico
  const handlePdfAnalysisUpload = (e: React.ChangeEvent<HTMLInputElement>, queryType: typeof pdfAnalysisQueries[0]) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Archivo demasiado grande",
        description: "El PDF debe ser menor a 20MB",
        variant: "destructive",
      });
      return;
    }

    if (file.type !== 'application/pdf') {
      toast({
        title: "Formato no válido",
        description: "Solo se permiten archivos PDF para esta función",
        variant: "destructive",
      });
      return;
    }

    // Procesar PDF
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const loadingTask: any = (pdfjsLib as any).getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        const maxPages = Math.min(pdf.numPages, 10); // Hasta 10 páginas para análisis de partes
        
        toast({
          title: 'Procesando PDF de parte',
          description: `Extrayendo ${maxPages} de ${pdf.numPages} página(s)...`,
        });

        const newImages: string[] = [];
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx!, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          newImages.push(dataUrl);
        }
        
        setSelectedImages(prev => [...prev, ...newImages]);
        setInput(queryType.query);
        setShowPdfAnalysisMenu(false);
        
        toast({
          title: 'PDF listo para análisis',
          description: `${maxPages} página(s) procesadas. La consulta "${queryType.label}" está preparada.`,
        });
      } catch (err) {
        console.error('Error procesando PDF:', err);
        toast({ title: 'Error', description: 'No se pudo leer el PDF.', variant: 'destructive' });
      }
    })();

    if (pdfAnalysisInputRef.current) {
      pdfAnalysisInputRef.current.value = '';
    }
  };

  const handleClearMessages = () => {
    setCurrentAnalysisIndex(-1);
    // Establecer el mensaje de bienvenida completo al limpiar
    if (organization?.name) {
      const welcomeMessage: Message = {
        role: "assistant",
        content: `¡Bienvenido al Asistente de Construcción de **${organization.name}**! 👷‍♂️\n\nEstoy aquí para ayudarte con:\n\n- 📋 Análisis de planos y documentos de construcción\n- 📊 Consultas sobre partes de trabajo y recursos\n- 🔍 Información del inventario de materiales\n- 📈 Informes de control de accesos\n- 📅 **Recordatorios de tareas del calendario**\n- 💡 Cualquier pregunta relacionada con tus proyectos\n\n¿En qué puedo ayudarte hoy?`
      };
      setMessages([welcomeMessage]);
    } else {
      setMessages([]);
    }
  };

  const navigateToPreviousAnalysis = () => {
    if (currentAnalysisIndex < savedAnalyses.length - 1) {
      const newIndex = currentAnalysisIndex + 1;
      setCurrentAnalysisIndex(newIndex);
      // Crear una copia profunda de los mensajes para evitar referencias
      const loadedMessages = JSON.parse(JSON.stringify(savedAnalyses[newIndex].messages));
      setMessages(loadedMessages);

      // Usar el índice guardado del mensaje de usuario
      const userMsgIdx = savedAnalyses[newIndex].userMessageIndex ?? 0;
      setPendingScrollIndex(userMsgIdx);

      toast({
        title: "Análisis cargado",
        description: `${savedAnalyses[newIndex].preview}`,
      });
    }
  };

  const navigateToNextAnalysis = () => {
    if (currentAnalysisIndex > 0) {
      const newIndex = currentAnalysisIndex - 1;
      setCurrentAnalysisIndex(newIndex);
      // Crear una copia profunda de los mensajes para evitar referencias
      const loadedMessages = JSON.parse(JSON.stringify(savedAnalyses[newIndex].messages));
      setMessages(loadedMessages);

      // Usar el índice guardado del mensaje de usuario
      const userMsgIdx = savedAnalyses[newIndex].userMessageIndex ?? 0;
      setPendingScrollIndex(userMsgIdx);

      toast({
        title: "Análisis cargado",
        description: `${savedAnalyses[newIndex].preview}`,
      });
    }
  };

  const loadAnalysisFromHistory = (index: number) => {
    setCurrentAnalysisIndex(index);
    // Crear una copia profunda de los mensajes para evitar referencias
    const loadedMessages = JSON.parse(JSON.stringify(savedAnalyses[index].messages));
    setMessages(loadedMessages);

    // Usar el índice guardado del mensaje de usuario
    const userMsgIdx = savedAnalyses[index].userMessageIndex ?? 0;
    setPendingScrollIndex(userMsgIdx);

    setShowHistory(false);
    toast({
      title: "Análisis cargado",
      description: `${savedAnalyses[index].preview}`,
    });
  };

  const deleteAnalysis = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevenir que se cargue el análisis al hacer clic en eliminar
    
    try {
      const updatedAnalyses = savedAnalyses.filter((_, i) => i !== index);
      setSavedAnalyses(updatedAnalyses);
      
      // Guardar con clave específica de la organización (o fallback)
      const storageKey = organization?.id ? `ai_plan_analyses_${organization.id}` : PENDING_ANALYSES_KEY;
      await storage.setItem(storageKey, JSON.stringify(updatedAnalyses));
      
      // Si se eliminó el análisis actual, resetear a nuevo análisis
      if (currentAnalysisIndex === index) {
        setMessages([]);
        setCurrentAnalysisIndex(-1);
      } else if (currentAnalysisIndex > index) {
        // Ajustar el índice si se eliminó un análisis anterior
        setCurrentAnalysisIndex(currentAnalysisIndex - 1);
      }
      
      toast({
        title: "Análisis eliminado",
        description: "El análisis se ha eliminado del historial",
      });
    } catch (error) {
      console.error('Error deleting analysis:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el análisis",
        variant: "destructive",
      });
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  };

  const handleExportPDF = async () => {
    if (messages.length === 0) {
      toast({
        title: "No hay mensajes",
        description: "No hay mensajes para exportar a PDF",
        variant: "destructive",
      });
      return;
    }

    try {
      // Si estamos viendo un análisis del historial, exportar solo el último par pregunta-respuesta
      let messagesToExport = messages;
      
      if (currentAnalysisIndex >= 0 && savedAnalyses[currentAnalysisIndex]) {
        const analysis = savedAnalyses[currentAnalysisIndex];
        const userMsgIdx = analysis.userMessageIndex ?? -1;
        
        if (userMsgIdx >= 0) {
          // Exportar desde el mensaje de usuario específico hasta el siguiente mensaje de usuario (o hasta el final)
          const nextUserIdx = messages.findIndex((m, idx) => idx > userMsgIdx && m.role === 'user');
          messagesToExport = nextUserIdx > 0 
            ? messages.slice(userMsgIdx, nextUserIdx)
            : messages.slice(userMsgIdx);
        }
      }
      
      // Obtener el nombre de la obra del contexto de work reports
      const workName = workReports && workReports.length > 0 
        ? workReports[0].workName 
        : undefined;
      
      // Obtener el primer mensaje de usuario como prompt
      const userPrompt = messagesToExport.length > 0 && messagesToExport[0].role === 'user'
        ? messagesToExport[0].content
        : undefined;

      await generateAIAnalysisPDF(
        messagesToExport,
        organization?.name,
        organization?.logo,
        workName,
        userPrompt,
        organization?.brand_color
      );
      
      toast({
        title: "PDF Generado",
        description: "El análisis visualizado se ha exportado correctamente a PDF",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el PDF",
        variant: "destructive",
      });
    }
  };


  const floatingButton = (
    <Button
      aria-label="Abrir asistente IA"
      onClick={handleButtonTap}
      onTouchStart={handleButtonTap}
      onMouseEnter={() => {
        setIsButtonHovered(true);
        setIsButtonActive(true);
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      }}
      onMouseLeave={() => {
        setIsButtonHovered(false);
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
        inactivityTimerRef.current = window.setTimeout(() => {
          setIsButtonActive(false);
        }, 2000);
      }}
      className={`fixed bottom-20 md:bottom-24 rounded-full shadow-2xl z-50 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-500 ease-in-out ${
        !isButtonEnabled 
          ? 'opacity-20 hover:opacity-40 right-2 md:right-3 h-10 w-10 md:h-12 md:w-12' 
          : isButtonActive || isButtonHovered || urgentTasks.length > 0
          ? 'right-4 md:right-6 h-14 w-14 md:h-16 md:w-16 hover:scale-110'
          : 'right-2 md:right-3 h-10 w-10 md:h-12 md:w-12 opacity-60 hover:opacity-100'
      }`}
      size="icon"
      title={isButtonEnabled ? "Toca para abrir • Doble toque para desactivar" : "Doble toque para activar"}
    >
      <HardHat className={`transition-all duration-300 ${
        isButtonActive || isButtonHovered || urgentTasks.length > 0 
          ? 'h-6 w-6 md:h-7 md:w-7' 
          : 'h-5 w-5 md:h-6 md:w-6'
      }`} />
      {urgentTasks.length > 0 && isButtonEnabled && (
        <>
          <Badge className="absolute -top-1 -right-1 h-6 w-6 p-0 flex items-center justify-center text-xs bg-destructive animate-pulse">
            {urgentTasks.length}
          </Badge>
          <Bell className="absolute -bottom-1 -left-1 h-4 w-4 text-destructive animate-bounce" />
        </>
      )}
    </Button>
  );


  const chatStyle = isFullscreen 
    ? { width: '100vw', height: '100vh', top: 0, right: 0, bottom: 0, left: 0 }
    : { 
        width: `min(92vw, ${chatSize.width}px)`,
        height: isMinimized ? '64px' : `min(calc(100vh - 2rem), ${chatSize.height}px)`,
        bottom: '1rem',
        right: '1rem'
      };

  const chatWindow = (
    <>
      {/* Resize Handles */}
      {!isMinimized && !isFullscreen && (
        <>
          <div
            className="fixed z-[9998] cursor-ew-resize hover:bg-primary/20 transition-colors"
            style={{
              right: `${chatSize.width + 16}px`,
              bottom: '1rem',
              height: `${chatSize.height}px`,
              width: '8px',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
              setResizeDirection('left');
            }}
          />
          <div
            className="fixed z-[9998] cursor-ns-resize hover:bg-primary/20 transition-colors"
            style={{
              right: '1rem',
              top: `calc(100vh - ${chatSize.height}px - 1rem - 8px)`,
              width: `${chatSize.width}px`,
              height: '8px',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
              setResizeDirection('top');
            }}
          />
        </>
      )}
      
      <Card
        ref={chatRef}
        className={`fixed shadow-2xl z-[9999] flex flex-col overflow-hidden max-w-[92vw] max-h-[calc(100vh-2rem)] transition-all duration-300 backdrop-blur-xl bg-background/95 border-2 ${
          isFullscreen ? 'rounded-none' : 'rounded-2xl'
        } ${isMinimized ? 'rounded-full' : ''}`}
        style={chatStyle}
      >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3 md:p-4 border-b shrink-0 bg-gradient-to-r from-primary/10 to-primary/5 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <div className="p-2 rounded-lg bg-primary/10 relative">
            <HardHat className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            {urgentTasks.length > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive animate-pulse">
                {urgentTasks.length}
              </Badge>
            )}
          </div>
          {!isMinimized && (
            <div className="flex flex-col min-w-0">
              <h3 className="font-semibold text-sm md:text-base truncate">Asistente IA</h3>
              <p className="text-xs text-muted-foreground truncate">
                Construcción & Análisis
                {urgentTasks.length > 0 && (
                  <span className="text-destructive ml-1">• {urgentTasks.length} tarea{urgentTasks.length > 1 ? 's' : ''} urgente{urgentTasks.length > 1 ? 's' : ''}</span>
                )}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {/* Menú móvil con acciones */}
          {!isMinimized && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden h-8 w-8 shrink-0 hover:bg-primary/10 transition-colors"
                  title="Más opciones"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-background border border-border shadow-lg z-[100000]">
                <>
                  <DropdownMenuItem
                    onClick={navigateToPreviousAnalysis}
                    disabled={savedAnalyses.length === 0 || currentAnalysisIndex >= savedAnalyses.length - 1}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Análisis anterior</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={navigateToNextAnalysis}
                    disabled={savedAnalyses.length === 0 || currentAnalysisIndex <= 0}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span>Análisis siguiente</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowHistory(true)}
                    disabled={savedAnalyses.length === 0}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <History className="h-4 w-4" />
                    <span>Ver historial ({savedAnalyses.length})</span>
                  </DropdownMenuItem>
                  {messages.length > 0 && <DropdownMenuSeparator />}
                </>
                {messages.length > 0 && (
                  <>
                    <DropdownMenuItem
                      onClick={handleExportPDF}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <FileDown className="h-4 w-4" />
                      <span>Exportar a PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleClearMessages}
                      className="flex items-center gap-2 cursor-pointer text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Vaciar mensajes</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Botones de escritorio */}
          {!isMinimized && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateToPreviousAnalysis}
                disabled={savedAnalyses.length === 0 || currentAnalysisIndex >= savedAnalyses.length - 1}
                className="hidden sm:inline-flex h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 transition-colors disabled:opacity-30"
                title="Análisis anterior"
              >
                <ChevronLeft className="h-4 w-4 md:h-4.5 md:w-4.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateToNextAnalysis}
                disabled={savedAnalyses.length === 0 || currentAnalysisIndex <= 0}
                className="hidden sm:inline-flex h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 transition-colors disabled:opacity-30"
                title="Análisis siguiente"
              >
                <ChevronRight className="h-4 w-4 md:h-4.5 md:w-4.5" />
              </Button>
              <Popover open={showHistory} onOpenChange={setShowHistory}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="inline-flex h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 transition-colors relative"
                    title="Historial de análisis"
                  >
                    <History className="h-4 w-4 md:h-4.5 md:w-4.5" />
                    {savedAnalyses.length > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary">
                        {savedAnalyses.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-2 z-[100000]" align="end">
                  <div className="space-y-1">
                    <div className="px-2 py-1.5 text-sm font-semibold text-foreground flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Historial de Análisis
                      </div>
                      {savedAnalyses.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              setSavedAnalyses([]);
                              const storageKey = organization?.id ? `ai_plan_analyses_${organization.id}` : PENDING_ANALYSES_KEY;
                              await storage.setItem(storageKey, JSON.stringify([]));
                              setMessages([]);
                              setCurrentAnalysisIndex(-1);
                              setShowHistory(false);
                              toast({
                                title: "Historial limpiado",
                                description: "Todos los análisis han sido eliminados",
                              });
                            } catch (error) {
                              console.error('Error clearing history:', error);
                              toast({
                                title: "Error",
                                description: "No se pudo limpiar el historial",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="h-7 text-xs hover:bg-destructive/10 hover:text-destructive"
                          title="Limpiar todo el historial"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Limpiar todo
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-1 pr-3">
                        {savedAnalyses.length === 0 ? (
                          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                            Aún no hay análisis guardados. Cuando completes un análisis, aparecerá aquí.
                          </div>
                        ) : (
                          savedAnalyses.map((analysis, index) => (
                            <div
                              key={analysis.id}
                              className={`relative group w-full text-left p-2 rounded-lg text-xs transition-colors hover:bg-primary/10 ${
                                currentAnalysisIndex === index ? 'bg-primary/20 border border-primary/30' : 'bg-card'
                              }`}
                            >
                              <button
                                onClick={() => loadAnalysisFromHistory(index)}
                                className="w-full text-left pr-8"
                              >
                                <div className="font-medium text-foreground truncate mb-1">
                                  {analysis.preview}
                                </div>
                                <div className="text-muted-foreground text-[10px]">
                                  {formatDate(analysis.timestamp)}
                                </div>
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => deleteAnalysis(index, e)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                                title="Eliminar análisis"
                              >
                                <Trash className="h-3 w-3" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {messages.length > 0 && !isMinimized && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExportPDF}
                className="hidden sm:inline-flex h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 transition-colors"
                title="Exportar a PDF"
              >
                <FileDown className="h-4 w-4 md:h-4.5 md:w-4.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearMessages}
                className="hidden sm:inline-flex h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Vaciar mensajes"
              >
                <Trash2 className="h-4 w-4 md:h-4.5 md:w-4.5" />
              </Button>
            </>
          )}
          {!isMinimized && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 transition-colors"
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              <Maximize className="h-4 w-4 md:h-4.5 md:w-4.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isMinimized) {
                setIsMinimized(false);
              } else {
                setIsMinimized(true);
                setIsFullscreen(false); // Salir de fullscreen al minimizar
              }
            }}
            className="h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 transition-colors"
            title={isMinimized ? "Expandir" : "Minimizar"}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4 md:h-4.5 md:w-4.5" /> : <Minimize2 className="h-4 w-4 md:h-4.5 md:w-4.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsOpen(false);
              setIsButtonEnabled(false);
              toast({
                title: "Chat desactivado",
                description: "El botón ahora es casi transparente. Doble clic para activarlo.",
                duration: 3000,
              });
            }}
            className="h-8 w-8 md:h-9 md:w-9 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Cerrar y desactivar"
          >
            <X className="h-4 w-4 md:h-4.5 md:w-4.5" />
          </Button>
        </div>
      </div>

      {/* Alert banner for urgent tasks */}
      {!isMinimized && urgentTasks.length > 0 && (
        <div className="px-3 md:px-4 pt-3 pb-2 border-b bg-destructive/5">
          <Alert className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-xs">
              <strong>{urgentTasks.length} tarea{urgentTasks.length > 1 ? 's' : ''} urgente{urgentTasks.length > 1 ? 's' : ''}</strong> - Revisa el calendario
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!isMinimized && (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 overflow-x-hidden" ref={scrollAreaRef}>
            <div className="min-h-full space-y-4 pb-4 px-3 md:px-4 w-full max-w-full overflow-x-hidden">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm mt-12 animate-fade-in">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 inline-block mb-4">
                  <HardHat className="h-16 w-16 mx-auto text-primary" />
                </div>
                <p className="font-bold text-lg text-foreground mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Asistente Especializado en Construcción
                </p>
                <p className="text-sm mb-1">Experto en obra civil, residencial, industrial y lineal</p>
                <div className="mt-6 text-left max-w-[280px] mx-auto text-sm bg-card/50 backdrop-blur-sm rounded-xl p-4 border">
                  <p className="font-semibold mb-3 text-primary">Puedo ayudarte con:</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">📊</span>
                      <span>Análisis de partes e informes</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">🔍</span>
                      <span>Detección de discrepancias</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">📈</span>
                      <span>Cálculos de rendimientos</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">💰</span>
                      <span>Análisis económico</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">⚙️</span>
                      <span>Comparativas de datos</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                data-message-index={idx}
                data-message-role={msg.role}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in min-w-0`}
              >
                <div
                  className={`w-full min-w-0 break-words whitespace-normal rounded-2xl shadow-md transition-all duration-300 hover:shadow-lg ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground p-4 sm:p-5"
                      : "bg-gradient-to-br from-card to-card/90 backdrop-blur-sm border-2 border-border/50 p-5 sm:p-6"
                  }`}
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', hyphens: 'auto' }}
                >
                  {msg.images && msg.images.length > 0 && (
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {msg.images.map((img, imgIdx) => (
                        <img 
                          key={imgIdx}
                          src={img} 
                          alt={`Plano ${imgIdx + 1}`}
                          className="rounded border border-border max-h-40 object-contain w-full"
                        />
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" ? (
                    <div className="ai-response-container markdown-wrap w-full max-w-full overflow-x-hidden">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({node, ...props}) => (
                            <h1 className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-3 mt-5 first:mt-0 pb-2 border-b-2 border-primary/30 !max-w-full !w-full [word-break:break-word]" {...props} />
                          ),
                          h2: ({node, ...props}) => (
                            <h2 className="text-sm sm:text-base md:text-lg font-bold text-primary mb-2.5 mt-4 first:mt-0 bg-gradient-to-r from-primary/10 to-transparent px-3 py-2 rounded-lg border-l-4 border-primary !max-w-full !w-full [word-break:break-word]" {...props} />
                          ),
                          h3: ({node, ...props}) => (
                            <h3 className="text-xs sm:text-sm md:text-base font-semibold text-foreground mb-2 mt-3 first:mt-0 flex items-start gap-2 !max-w-full !w-full [word-break:break-word]">
                              <span className="w-1 h-4 sm:h-5 bg-gradient-to-b from-primary to-primary/60 rounded-full flex-shrink-0 mt-0.5" />
                              <span className="flex-1 min-w-0 [word-break:break-word]" {...props} />
                            </h3>
                          ),
                          p: ({node, ...props}) => (
                            <p className="mb-3 text-foreground/90 leading-relaxed text-xs sm:text-sm md:text-base !max-w-full !w-full [word-break:break-word] [overflow-wrap:anywhere]" {...props} />
                          ),
                          ul: ({node, ...props}) => (
                            <ul className="mb-3 space-y-1.5 text-xs sm:text-sm md:text-base !max-w-full !w-full [word-break:break-word]" {...props} />
                          ),
                          ol: ({node, ...props}) => (
                            <ol className="mb-3 space-y-1.5 text-xs sm:text-sm md:text-base list-decimal pl-5 !max-w-full !w-full [word-break:break-word]" {...props} />
                          ),
                          li: ({node, ...props}) => (
                            <li className="text-foreground/90 ml-1 pl-2 relative before:content-['▸'] before:absolute before:left-[-12px] before:text-primary before:font-bold before:text-sm !max-w-full [word-break:break-word] [overflow-wrap:anywhere]" {...props} />
                          ),
                          strong: ({node, ...props}) => (
                            <strong className="font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded [word-break:break-word] inline" {...props} />
                          ),
                          em: ({node, ...props}) => (
                            <em className="italic text-muted-foreground not-italic bg-muted/50 px-1 py-0.5 rounded [word-break:break-word] inline" {...props} />
                          ),
                          a: ({node, ...props}) => (
                            <a className="text-primary hover:text-primary/80 underline underline-offset-2 font-medium transition-colors [word-break:break-all] inline" {...props} />
                          ),
                          code: ({node, inline, ...props}: any) => 
                            inline ? (
                              <code className="bg-primary/15 text-primary px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-mono border border-primary/25 font-semibold [word-break:break-all] inline-block max-w-full" {...props} />
                            ) : (
                              <code className="block bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm p-3 rounded-xl text-[10px] sm:text-xs font-mono border border-border/50 my-3 shadow-md whitespace-pre overflow-x-auto max-w-full" {...props} />
                            ),
                          img: ({node, ...props}) => (
                            <img className="!max-w-full !w-auto h-auto rounded-xl border-2 border-border/50 shadow-lg my-3" {...props} />
                          ),
                          table: ({node, ...props}) => (
                            <div className="ai-table-wrapper mdk-hscroll !w-full !max-w-full overflow-x-auto overflow-y-visible my-4 rounded-xl border-2 border-primary/20 shadow-lg bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm">
                              <table className="min-w-max border-collapse text-[10px] sm:text-xs" {...props} />
                            </div>
                          ),
                          thead: ({node, ...props}) => (
                            <thead className="bg-gradient-to-r from-primary/20 to-primary/10 sticky top-0 z-10" {...props} />
                          ),
                          th: ({node, ...props}) => (
                            <th className="bg-gradient-to-b from-primary/15 to-primary/10 px-2 sm:px-3 py-2 text-left font-bold text-primary border-b-2 border-primary/30 whitespace-nowrap text-[10px] sm:text-xs first:rounded-tl-xl last:rounded-tr-xl" {...props} />
                          ),
                          td: ({node, ...props}) => (
                            <td className="px-2 sm:px-3 py-2 text-foreground/90 border-b border-border/40 whitespace-nowrap hover:bg-primary/5 transition-colors text-[10px] sm:text-xs" {...props} />
                          ),
                          tr: ({node, ...props}) => (
                            <tr className="hover:bg-primary/5 transition-colors" {...props} />
                          ),
                          blockquote: ({node, ...props}) => (
                            <blockquote className="border-l-4 border-primary bg-gradient-to-r from-primary/10 to-transparent px-3 sm:px-4 py-3 my-3 rounded-r-xl italic text-foreground/80 shadow-sm !max-w-full !w-full [word-break:break-word]" {...props} />
                          ),
                          hr: ({node, ...props}) => (
                            <hr className="my-5 border-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent rounded-full" {...props} />
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm md:text-base whitespace-pre-wrap leading-relaxed !max-w-full !w-full [word-break:break-word] [overflow-wrap:anywhere]">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-card/80 backdrop-blur-sm border border-border/50 p-4 rounded-2xl shadow-sm">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce" />
                    <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 md:p-4 border-t shrink-0">
            {selectedImages.length > 0 && (
              <div className="mb-2 flex gap-2 flex-wrap">
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img 
                      src={img} 
                      alt={`Preview ${idx + 1}`}
                      className="h-16 w-16 object-cover rounded border border-border"
                    />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Menú de Análisis de PDF de Partes */}
            {showPdfAnalysisMenu && (
              <div className="mb-3 p-3 bg-card/80 backdrop-blur-sm border border-border rounded-xl animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Análisis de PDF - Partes de Trabajo
                  </h4>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPdfAnalysisMenu(false)}
                    className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Selecciona el tipo de análisis y sube un PDF de parte de trabajo
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pdfAnalysisQueries.map((query, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
                    >
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => handlePdfAnalysisUpload(e, query)}
                      />
                      <div className="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <query.icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-foreground">{query.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <input
                ref={pdfAnalysisInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => handlePdfAnalysisUpload(e, pdfAnalysisQueries[0])}
                className="hidden"
              />
              
              {/* Botón de Análisis PDF de Partes */}
              <Popover open={showPdfAnalysisMenu} onOpenChange={setShowPdfAnalysisMenu}>
                <PopoverTrigger asChild>
                  <Button
                    disabled={isLoading}
                    size="icon"
                    variant="outline"
                    className={`h-[50px] w-[50px] md:h-[60px] md:w-[60px] shrink-0 transition-all ${showPdfAnalysisMenu ? 'bg-primary/10 border-primary' : ''}`}
                    title="Análisis de PDF de Partes de Trabajo"
                  >
                    <FileText className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  side="top" 
                  align="start" 
                  className="w-80 p-3 z-[100000]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">Análisis de PDF</h4>
                        <p className="text-xs text-muted-foreground">Partes de trabajo</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Selecciona el tipo de análisis que deseas realizar sobre el PDF del parte:
                    </p>
                    <div className="space-y-2">
                      {pdfAnalysisQueries.map((query, idx) => (
                        <label
                          key={idx}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
                        >
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => handlePdfAnalysisUpload(e, query)}
                          />
                          <div className="p-2 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                            <query.icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground block">{query.label}</span>
                            <span className="text-xs text-muted-foreground line-clamp-2">{query.query.substring(0, 60)}...</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                size="icon"
                variant="outline"
                className="h-[50px] w-[50px] md:h-[60px] md:w-[60px] shrink-0"
                title="Añadir imagen de plano"
              >
                <ImageIcon className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escribe tu consulta o sube un plano..."
                className="min-h-[50px] md:min-h-[60px] resize-none text-sm md:text-base flex-1 min-w-0"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={(!input.trim() && selectedImages.length === 0) || isLoading}
                size="icon"
                className="h-[50px] w-[50px] md:h-[60px] md:w-[60px] shrink-0"
              >
                <Send className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </div>
          </div>
         </>
        )}
     </Card>
    </>
  );

  return createPortal(
    <>
      {!isOpen && floatingButton}
      {isOpen && chatWindow}
    </>
  , document.body);
};

