import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import {
  createMessage,
  deleteConversationMessages,
  deleteMessage,
  listMessages,
  listUsersByTenant,
  type ApiUser,
} from '@/integrations/api/client';
import { toast } from '@/hooks/use-toast';
import { 
  Send, 
  BookOpen, 
  HelpCircle, 
  MessageSquare, 
  Loader2,
  Search,
  FileText,
  Users,
  Building2,
  Package,
  Briefcase,
  TrendingUp,
  Shield,
  Globe,
  FileCheck,
  Zap,
  Trash2,
  Trash,
  Mic,
  Bot,
  Calendar,
  Share2,
  WifiOff,
  Bell,
  Building,
  Scan,
  ChevronRight,
  CheckCircle2,
  Clock,
  Truck,
  Wrench,
  BarChart3,
  Lock,
  Key,
  UserCheck,
  Printer,
  Upload,
  Download,
  Settings,
  Play,
  Camera,
  ClipboardList,
  FolderOpen,
  Navigation
} from 'lucide-react';

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  created_at: string;
  from_user_name?: string;
}

interface FeatureCategory {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
  gradient: string;
  features: FeatureCard[];
}

interface FeatureCard {
  id: string;
  icon: any;
  title: string;
  description: string;
  steps: string[];
  tips?: string[];
  roles: string[];
}

const ADMIN_ROLE_NAMES = new Set([
  'admin',
  'master',
  'super_admin',
  'tenant_admin',
]);

const hasAdminRole = (candidate: ApiUser): boolean => {
  if (candidate.is_super_admin) return true;
  const roleNames = Array.isArray(candidate.roles)
    ? candidate.roles
    : candidate.role_name
      ? [String(candidate.role_name)]
      : [];
  return roleNames.some((role) => ADMIN_ROLE_NAMES.has(String(role).trim().toLowerCase()));
};

export const HelpCenter = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;
  const { isMaster, isAdmin, isSiteManager, isForeman, isOfi, isReader } = useUserPermissions();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id && currentUserId) {
      loadAdmin();
    } else {
      setAdminId(null);
    }
  }, [user?.tenant_id, currentUserId]);

  useEffect(() => {
    if (adminId && currentUserId) {
      loadMessages();
      const channel = subscribeToMessages();
      return () => {
        channel.unsubscribe();
      };
    }
  }, [adminId, currentUserId]);

  const loadAdmin = async () => {
    if (!user?.tenant_id || !currentUserId) return;
    try {
      const users = await listUsersByTenant(user.tenant_id, false);
      const adminUser = users.find(
        (candidate) =>
          candidate.is_active &&
          String(candidate.id) !== currentUserId &&
          hasAdminRole(candidate)
      );
      setAdminId(adminUser ? String(adminUser.id) : null);
    } catch (error) {
      console.error('Error loading admin:', error);
      setAdminId(null);
    }
  };

  const loadMessages = async () => {
    if (!currentUserId || !adminId) return;
    
    setLoading(true);
    try {
      const response = await listMessages({ limit: 500, offset: 0 });
      const messagesWithNames = response.items
        .filter(
          (msg) =>
            (msg.from_user_id === currentUserId && msg.to_user_id === adminId) ||
            (msg.from_user_id === adminId && msg.to_user_id === currentUserId)
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map((msg) => ({
          id: String(msg.id),
          from_user_id: msg.from_user_id,
          to_user_id: msg.to_user_id,
          message: msg.message,
          created_at: msg.created_at,
          from_user_name: msg.from_user?.full_name || 'Usuario',
        }));
      
      setMessages(messagesWithNames);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    const pollId = window.setInterval(() => {
      void loadMessages();
    }, 10000);
    return {
      unsubscribe: () => window.clearInterval(pollId),
    };
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !adminId) return;

    setSendingMessage(true);
    try {
      await createMessage({
        to_user_id: adminId,
        message: newMessage.trim(),
      });

      setNewMessage('');
      toast({ title: t('help.messageSent'), description: t('help.messageSentDesc') });
      loadMessages();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({ title: t('help.errorSending'), description: t('help.errorSendingDesc'), variant: 'destructive' });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const numericId = Number(messageId);
    if (!Number.isFinite(numericId)) return;
    try {
      await deleteMessage(numericId);
      toast({ title: t('help.messageDeleted'), description: t('help.messageDeletedDesc') });
      loadMessages();
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast({ title: t('help.errorDeleting'), description: t('help.errorDeletingDesc'), variant: 'destructive' });
    }
  };

  const handleClearConversation = async () => {
    if (!currentUserId || !adminId) return;
    if (!confirm(t('help.clearConfirm'))) return;

    try {
      await deleteConversationMessages(adminId);
      toast({ title: t('help.conversationCleared'), description: t('help.conversationClearedDesc') });
      loadMessages();
    } catch (error: any) {
      console.error('Error clearing conversation:', error);
      toast({ title: t('help.errorClearing'), description: t('help.errorClearingDesc'), variant: 'destructive' });
    }
  };

  const getUserRole = () => {
    if (isMaster) return 'master';
    if (isAdmin) return 'admin';
    if (isSiteManager) return 'site_manager';
    if (isForeman) return 'foreman';
    if (isOfi) return 'ofi';
    if (isReader) return 'reader';
    return 'reader';
  };

  const currentRole = getUserRole();

  // Definir categorías con sus funcionalidades
  const featureCategories: FeatureCategory[] = [
    {
      id: 'work-reports',
      title: 'Partes de Trabajo',
      description: 'Crea, edita y gestiona tus partes de trabajo diarios',
      icon: FileText,
      color: 'text-blue-600',
      gradient: 'from-blue-500/20 to-blue-600/10',
      features: [
        {
          id: 'create-report',
          icon: FileText,
          title: 'Crear un Parte de Trabajo',
          description: 'Aprende a crear partes de trabajo paso a paso',
          steps: [
            'Ve a la pestaña "Partes de Trabajo" en el menú principal',
            'Haz clic en el botón "Nuevo Parte" o usa "Parte de Hoy"',
            'Selecciona la obra asignada (obligatorio)',
            'Completa la información: Jefe de Obra y Encargado',
            'Añade los trabajos realizados con empresa, actividad, horas y trabajadores',
            'Registra la maquinaria utilizada',
            'Añade los materiales consumidos (automático con IA)',
            'Incluye subcontratas si las hay',
            'Añade observaciones relevantes',
            'Guarda el parte seleccionando el estado apropiado'
          ],
          tips: [
            'Usa el botón "Parte de Hoy" para acceso rápido',
            'Los materiales se añaden automáticamente al escanear albaranes',
            'Marca las secciones como completadas para un seguimiento visual'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'navigate-reports',
          icon: Navigation,
          title: 'Navegar entre Partes',
          description: 'Usa los controles de navegación para moverte entre partes',
          steps: [
            'Abre cualquier parte de trabajo para editarlo',
            'En la cabecera verás botones "Anterior" y "Siguiente"',
            'La navegación respeta el modo de agrupación actual',
            'Si estás viendo por encargado, navegas entre partes del mismo encargado',
            'Si estás viendo por mes, navegas entre partes del mismo mes',
            'El contador muestra tu posición (ej: 3 / 15)'
          ],
          tips: [
            'Cambia el modo de vista antes de entrar al parte para controlar la navegación',
            'Usa Ctrl + flechas para navegación rápida (próximamente)'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        },
        {
          id: 'export-reports',
          icon: Download,
          title: 'Exportar Partes',
          description: 'Exporta partes en PDF o Excel',
          steps: [
            'Abre el parte que quieres exportar',
            'Haz clic en "Descargar PDF" para documento individual',
            'Elige si incluir imágenes de albaranes',
            'Para exportación masiva, usa los botones en la lista de partes',
            'Selecciona "Excel Semanal" o "Excel Mensual" según necesites'
          ],
          tips: [
            'Los PDF incluyen el logo de tu organización',
            'Excel agrupa los datos por semanas/meses automáticamente'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        },
        {
          id: 'clone-report',
          icon: ClipboardList,
          title: 'Clonar Partes',
          description: 'Duplica partes para reutilizar información',
          steps: [
            'Abre el parte que quieres clonar',
            'Haz clic en el menú de acciones (⋮)',
            'Selecciona "Clonar"',
            'Elige la fecha para el nuevo parte',
            'Selecciona qué secciones copiar',
            'El nuevo parte se creará con la información seleccionada'
          ],
          tips: [
            'Útil para trabajos repetitivos',
            'Puedes elegir qué secciones copiar (trabajos, maquinaria, etc.)'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'approve-report',
          icon: CheckCircle2,
          title: 'Aprobar Partes',
          description: 'Sistema de aprobación y firmas',
          steps: [
            'Abre el parte que quieres aprobar',
            'Revisa toda la información del parte',
            'Añade tu firma digital en el campo correspondiente',
            'Haz clic en el botón "Aprobar"',
            'El parte quedará bloqueado para edición',
            'Los usuarios de oficina verán los partes aprobados'
          ],
          tips: [
            'Solo jefes de obra y administradores pueden aprobar',
            'Los partes aprobados aparecen con indicador verde'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'comments-section',
          icon: MessageSquare,
          title: 'Comentarios en Partes',
          description: 'Sistema de comentarios colaborativos en tiempo real',
          steps: [
            'Abre cualquier parte de trabajo',
            'Busca la sección "Comentarios" al final del formulario',
            'Escribe tu comentario o pregunta',
            'Haz clic en "Publicar comentario"',
            'Los comentarios aparecen en tiempo real para todos los usuarios',
            'Cada comentario muestra el autor y la fecha/hora'
          ],
          tips: [
            'Usa comentarios para coordinar con el equipo',
            'Los comentarios se sincronizan en tiempo real',
            'Ideal para aclaraciones sobre el trabajo realizado'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'active-repasos-widget',
          icon: Wrench,
          title: 'Widget de Repasos Activos',
          description: 'Visualiza repasos pendientes y en progreso en cada parte',
          steps: [
            'Al crear/editar un parte, verás el widget de repasos activos',
            'Muestra repasos pendientes (ámbar) y en proceso (azul)',
            'Indica horas estimadas y reales consumidas',
            'Muestra empresa asignada a cada repaso',
            'Los repasos se gestionan desde Obras → Repasos'
          ],
          tips: [
            'El widget aparece automáticamente si hay repasos activos',
            'Útil para saber qué trabajos pendientes hay en la obra'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'ai-features',
      title: 'Inteligencia Artificial',
      description: 'Funciones de IA para automatizar tareas',
      icon: Bot,
      color: 'text-violet-600',
      gradient: 'from-violet-500/20 to-violet-600/10',
      features: [
        {
          id: 'ai-scanner',
          icon: Scan,
          title: 'Escáner IA de Albaranes',
          description: 'Escanea facturas y albaranes automáticamente',
          steps: [
            'En la sección de Materiales, haz clic en "Escanear IA"',
            'Captura una foto del albarán o sube una imagen',
            'La IA extraerá: fecha, proveedor, número de albarán, materiales',
            'Revisa la información detectada',
            'Si la fecha detectada difiere, el sistema reubica automáticamente',
            'Confirma para añadir al parte de trabajo'
          ],
          tips: [
            'Asegura buena iluminación para mejor reconocimiento',
            'El sistema detecta duplicados automáticamente',
            'Si no existe parte para la fecha, se crea automáticamente'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'ai-assistant',
          icon: Bot,
          title: 'Asistente de IA',
          description: 'Chat inteligente para consultas sobre tus partes',
          steps: [
            'Haz clic en el botón flotante de chat IA (esquina inferior)',
            'Escribe tu pregunta o consulta',
            'El asistente analiza tus partes de trabajo',
            'Puedes pedir resúmenes, análisis de costes, tendencias',
            'Sube imágenes o PDFs para análisis específico',
            'Guarda conversaciones importantes para referencia'
          ],
          tips: [
            'Pregunta: "¿Cuánto gastamos en materiales este mes?"',
            'Pregunta: "Resume los trabajos de la obra X"',
            'El asistente recuerda el contexto de la conversación'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'voice-input',
          icon: Mic,
          title: 'Entrada por Voz',
          description: 'Dicta información usando comandos de voz',
          steps: [
            'Abre un parte de trabajo',
            'Haz clic en el botón flotante de micrófono',
            'Selecciona la sección a llenar (Trabajos, Maquinaria, etc.)',
            'Dicta la información usando comandos naturales',
            'La transcripción aparece en tiempo real',
            'Los datos se añaden automáticamente a los campos'
          ],
          tips: [
            'Comandos: "añadir grupo", "siguiente fila", "marcar completo"',
            'Di "cambiar empresa a [nombre]" para cambiar campos',
            'Usa "copiar grupo anterior" para duplicar información'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'duplicate-detection',
          icon: FileCheck,
          title: 'Detección de Duplicados',
          description: 'Sistema automático de detección de albaranes duplicados',
          steps: [
            'Al escanear un albarán, el sistema busca duplicados',
            'Si se encuentran, aparece un diálogo con las coincidencias',
            'Selecciona cuáles eliminar usando los checkboxes',
            'Usa "Actualizar" en el encabezado para análisis global',
            'El sistema reubica albaranes a su fecha correcta automáticamente'
          ],
          tips: [
            'La detección compara proveedor y número de albarán',
            'Revisa cuidadosamente antes de eliminar',
            'El análisis global verifica todos los partes existentes'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'repasos-postventas',
      title: 'Repasos y Postventas',
      description: 'Gestión de trabajos de repaso y servicios postventa',
      icon: Wrench,
      color: 'text-orange-600',
      gradient: 'from-orange-500/20 to-orange-600/10',
      features: [
        {
          id: 'manage-repasos',
          icon: Wrench,
          title: 'Gestionar Repasos',
          description: 'Crea y controla trabajos de repaso en obras',
          steps: [
            'Ve a "Obras" en el menú principal',
            'Selecciona una obra y abre la pestaña "Repasos"',
            'Haz clic en "Nuevo Repaso"',
            'Añade descripción, empresa asignada y horas estimadas',
            'El código se genera automáticamente (REP-001, REP-002...)',
            'Cambia el estado: Pendiente → En Proceso → Completado',
            'Añade fotos de antes/después del trabajo'
          ],
          tips: [
            'Los repasos activos aparecen en el widget de cada parte',
            'Puedes asignar subcontratas específicas a cada repaso',
            'Las horas reales se actualizan manualmente'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'manage-postventas',
          icon: UserCheck,
          title: 'Gestionar Postventas',
          description: 'Servicios postventa y garantías',
          steps: [
            'Ve a "Obras" → selecciona obra → "Postventas"',
            'Haz clic en "Nueva Postventa"',
            'Describe el problema o solicitud del cliente',
            'Asigna empresa responsable y horas estimadas',
            'Sigue el progreso: Pendiente → En Proceso → Completado',
            'Documenta con fotos antes y después'
          ],
          tips: [
            'Diferencia con repasos: postventas son para clientes finales',
            'Exporta listados de postventas para informes de calidad'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'repasos-photos',
          icon: Camera,
          title: 'Fotos de Antes/Después',
          description: 'Documenta visualmente el trabajo realizado',
          steps: [
            'Abre un repaso o postventa existente',
            'En la sección de imágenes, haz clic en "Subir Antes"',
            'Captura o selecciona la foto del estado inicial',
            'Al completar el trabajo, añade la foto "Después"',
            'Las imágenes se guardan asociadas al registro'
          ],
          tips: [
            'Las fotos son evidencia importante para garantías',
            'Puedes ampliar las imágenes haciendo clic en ellas'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'access-control',
      title: 'Control de Accesos',
      description: 'Gestiona entradas y salidas de personal y maquinaria',
      icon: UserCheck,
      color: 'text-red-600',
      gradient: 'from-red-500/20 to-red-600/10',
      features: [
        {
          id: 'access-report',
          icon: ClipboardList,
          title: 'Crear Control de Accesos',
          description: 'Registra entradas y salidas del personal',
          steps: [
            'Ve a "Control de Accesos" en el menú',
            'Haz clic en "Nuevo Registro"',
            'Selecciona la obra correspondiente',
            'Añade el personal con hora de entrada',
            'Registra la maquinaria que entra/sale',
            'Actualiza horas de salida al finalizar la jornada',
            'Guarda el registro'
          ],
          tips: [
            'El control de accesos se sincroniza con los partes de trabajo',
            'Puedes copiar datos de días anteriores',
            'Exporta a PDF o Excel para documentación'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'bulk-access',
          icon: Users,
          title: 'Eliminación Masiva',
          description: 'Selecciona y elimina múltiples registros',
          steps: [
            'En la lista de controles, activa el modo selección',
            'Marca los registros que quieres eliminar',
            'Usa "Seleccionar día" para seleccionar todos de una fecha',
            'Confirma la eliminación en el diálogo',
            'Los registros se eliminarán permanentemente'
          ],
          tips: [
            'Ten cuidado, esta acción no se puede deshacer',
            'Verifica que no hay errores antes de eliminar'
          ],
          roles: ['master', 'admin', 'site_manager']
        }
      ]
    },
    {
      id: 'works-geolocation',
      title: 'Radar de Obras',
      description: 'Vista geográfica interactiva de todas tus obras',
      icon: Globe,
      color: 'text-cyan-600',
      gradient: 'from-cyan-500/20 to-cyan-600/10',
      features: [
        {
          id: 'radar-view',
          icon: Globe,
          title: 'Vista de Radar',
          description: 'Visualiza todas las obras en un mapa interactivo',
          steps: [
            'Accede a "Radar" desde el menú inferior (móvil) o lateral',
            'Verás un mapa con marcadores de todas las obras geolocalizadas',
            'Obras activas en color primario, finalizadas en gris',
            'Haz clic en un marcador para ver información de la obra',
            'Desde el popup puedes borrar la ubicación o ver detalles'
          ],
          tips: [
            'El radar solo muestra obras con coordenadas GPS',
            'Usa los controles de zoom para navegar por el mapa',
            'Útil para planificar rutas y visualizar distribución de obras'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'capture-gps',
          icon: Navigation,
          title: 'Capturar Ubicación GPS',
          description: 'Geolocaliza obras automáticamente desde tu posición',
          steps: [
            'Ve a "Obras" y edita una obra existente o crea una nueva',
            'En la sección de dirección, haz clic en "Capturar GPS"',
            'Permite el acceso a ubicación cuando el navegador lo solicite',
            'Las coordenadas se capturan automáticamente',
            'Los campos de dirección se rellenan con Reverse Geocoding',
            'Revisa y ajusta la dirección si es necesario'
          ],
          tips: [
            'El GPS rellena automáticamente: calle, ciudad, provincia, país',
            'Funciona mejor con buena señal GPS (en exteriores)',
            'La dirección se concatena automáticamente al guardar'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'geocoding',
          icon: Search,
          title: 'Buscar Coordenadas por Dirección',
          description: 'Obtén coordenadas GPS escribiendo una dirección',
          steps: [
            'Ve a editar una obra',
            'Rellena los campos de dirección: calle, población, provincia',
            'Haz clic en "Buscar coordenadas"',
            'El sistema consulta la API de Nominatim (OpenStreetMap)',
            'Si encuentra la dirección, rellena latitud y longitud',
            'La obra aparecerá en el Radar con su ubicación correcta'
          ],
          tips: [
            'Cuanto más completa la dirección, mejor la precisión',
            'Útil cuando no estás físicamente en la ubicación',
            'Compatible con direcciones de España y otros países'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'deadlines',
      title: 'Próximos Vencimientos',
      description: 'Control de plazos y fases críticas de obra',
      icon: Clock,
      color: 'text-rose-600',
      gradient: 'from-rose-500/20 to-rose-600/10',
      features: [
        {
          id: 'deadlines-widget',
          icon: Clock,
          title: 'Widget de Vencimientos',
          description: 'Panel colapsable con plazos próximos a vencer',
          steps: [
            'En el Dashboard, verás el widget "Próximos Vencimientos"',
            'El widget muestra un resumen compacto cuando está cerrado',
            'Badges rojos = tareas críticas/retrasadas, amarillos = próximas',
            'Haz clic para expandir y ver el detalle de cada fase',
            'Cada tarjeta muestra obra, fase, fecha límite y progreso'
          ],
          tips: [
            'El icono de fuego 🔥 indica tareas críticas o vencidas',
            'El icono de reloj ⏳ indica advertencias próximas a vencer',
            'Si no hay vencimientos, verás "¡Todo al día!" con confeti'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'phases-management',
          icon: Calendar,
          title: 'Gestionar Fases de Obra',
          description: 'Crea y controla fases con fechas límite',
          steps: [
            'Ve a "Obras" → selecciona una obra → "Fases"',
            'Haz clic en "Nueva Fase"',
            'Define: nombre, descripción, fechas inicio/fin',
            'Asigna responsable y establece el progreso (%)',
            'El sistema calcula automáticamente el estado',
            'Las fases próximas a vencer aparecen en el widget'
          ],
          tips: [
            'Las fases se muestran en la línea de tiempo (Timeline)',
            'Actualiza el progreso regularmente para un seguimiento preciso',
            'Configura notificaciones para recordatorios automáticos'
          ],
          roles: ['master', 'admin', 'site_manager']
        }
      ]
    },
    {
      id: 'inventory',
      title: 'Inventario de Obra',
      description: 'Control de materiales, maquinaria y consumos',
      icon: Package,
      color: 'text-indigo-600',
      gradient: 'from-indigo-500/20 to-indigo-600/10',
      features: [
        {
          id: 'view-inventory',
          icon: Package,
          title: 'Consultar Inventario',
          description: 'Visualiza el stock y consumos de cada obra',
          steps: [
            'El inventario se actualiza automáticamente con los partes',
            'Ve a "Inventario" en el menú de obras',
            'Selecciona la obra que quieres consultar',
            'Filtra por mes y año para ver un periodo específico',
            'Revisa materiales, maquinaria y subcontratas',
            'Exporta a Excel para análisis detallado'
          ],
          tips: [
            'Los datos vienen directamente de los partes de trabajo',
            'Usa el filtro de fechas para comparar periodos',
            'El inventario muestra cantidades acumuladas'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'merge-suppliers',
          icon: Wrench,
          title: 'Fusionar Proveedores',
          description: 'Combina proveedores duplicados',
          steps: [
            'En el inventario, selecciona los proveedores duplicados',
            'Haz clic en "Fusionar"',
            'Elige el nombre definitivo',
            'Confirma la fusión',
            'Los materiales se consolidan bajo un único proveedor'
          ],
          tips: [
            'Útil cuando hay variaciones en nombres de proveedores',
            'La fusión es irreversible, verifica antes de confirmar'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'validate-inventory',
          icon: CheckCircle2,
          title: 'Validar y Corregir',
          description: 'Corrige automáticamente errores en el inventario',
          steps: [
            'Haz clic en "Validar y Corregir"',
            'El sistema analiza inconsistencias',
            'Revisa los errores detectados',
            'Confirma las correcciones propuestas',
            'El inventario se actualiza automáticamente'
          ],
          roles: ['master', 'admin', 'site_manager']
        }
      ]
    },
    {
      id: 'machinery',
      title: 'Maquinaria de Alquiler',
      description: 'Gestión de maquinaria alquilada',
      icon: Truck,
      color: 'text-amber-600',
      gradient: 'from-amber-500/20 to-amber-600/10',
      features: [
        {
          id: 'rental-machinery',
          icon: Truck,
          title: 'Registrar Maquinaria',
          description: 'Añade y gestiona maquinaria de alquiler',
          steps: [
            'Ve a "Gestión de Obras" y selecciona una obra',
            'Abre la pestaña "Maquinaria de Alquiler"',
            'Haz clic en "Añadir Máquina"',
            'Completa: proveedor, tipo, número, fecha de entrega',
            'Añade tarifa diaria y notas opcionales',
            'La máquina aparecerá automáticamente en los partes diarios'
          ],
          tips: [
            'El sistema calcula días y coste total automáticamente',
            'Las máquinas activas aparecen en partes en modo solo lectura',
            'Puedes añadir fotos de la maquinaria'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'machinery-assignments',
          icon: Calendar,
          title: 'Asignaciones de Maquinaria',
          description: 'Controla qué máquinas están asignadas a cada obra',
          steps: [
            'Desde el parte de trabajo, ve a "Maquinaria Alquilada"',
            'Haz clic en "Gestionar Asignaciones"',
            'Selecciona la máquina y el operador',
            'Define la actividad y fechas',
            'La información se refleja en los partes correspondientes'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'economic',
      title: 'Gestión Económica',
      description: 'Análisis de costes y reportes financieros',
      icon: TrendingUp,
      color: 'text-emerald-600',
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      features: [
        {
          id: 'economic-analysis',
          icon: BarChart3,
          title: 'Análisis Económico',
          description: 'Analiza costes detallados por obra',
          steps: [
            'Ve a "Gestión Económica" en el menú',
            'Selecciona la obra a analizar',
            'Define el rango de fechas',
            'El sistema calcula costes de mano de obra, materiales, maquinaria',
            'Revisa el desglose por categoría',
            'Genera un PDF con el análisis completo'
          ],
          tips: [
            'Compara periodos para ver tendencias',
            'Los datos provienen de los partes de trabajo',
            'Guarda análisis para referencia futura'
          ],
          roles: ['master', 'admin', 'site_manager', 'ofi']
        },
        {
          id: 'saved-reports',
          icon: FolderOpen,
          title: 'Informes Guardados',
          description: 'Accede a análisis económicos anteriores',
          steps: [
            'Ve a "Gestión Económica" > "Informes Guardados"',
            'Filtra por obra o fecha',
            'Haz clic en un informe para ver detalles',
            'Compara con informes anteriores',
            'Exporta a PDF cuando necesites'
          ],
          roles: ['master', 'admin', 'site_manager', 'ofi']
        },
        {
          id: 'advanced-reports',
          icon: BarChart3,
          title: 'Informes Avanzados',
          description: 'Genera reportes detallados con filtros avanzados',
          steps: [
            'Ve a "Informes Avanzados"',
            'Selecciona tipo: semanal, mensual, trimestral o personalizado',
            'Filtra por obra específica o todas',
            'El informe incluye: horas de encargado, trabajadores, maquinaria',
            'Exporta en formato Excel o PDF'
          ],
          tips: [
            'Incluye análisis de maquinaria de alquiler editable',
            'Puedes modificar fechas y tarifas directamente'
          ],
          roles: ['master', 'admin', 'site_manager']
        }
      ]
    },
    {
      id: 'calendar',
      title: 'Calendario y Tareas',
      description: 'Organiza tareas y recordatorios',
      icon: Calendar,
      color: 'text-sky-600',
      gradient: 'from-sky-500/20 to-sky-600/10',
      features: [
        {
          id: 'calendar-tasks',
          icon: Calendar,
          title: 'Calendario de Tareas',
          description: 'Crea y gestiona tareas con fechas',
          steps: [
            'Accede al Calendario desde el menú móvil',
            'Selecciona una fecha para ver/crear tareas',
            'Añade título, descripción y prioridad',
            'Asigna a un usuario o a una obra',
            'Define hora de vencimiento (opcional)',
            'Marca como completada cuando termines'
          ],
          tips: [
            'Las tareas urgentes generan notificaciones automáticas',
            'El asistente IA te avisa de tareas pendientes',
            'Vista de calendario y lista disponibles'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
      ]
    },
    {
      id: 'communication',
      title: 'Comunicación',
      description: 'Mensajería, archivos y notificaciones',
      icon: MessageSquare,
      color: 'text-pink-600',
      gradient: 'from-pink-500/20 to-pink-600/10',
      features: [
        {
          id: 'messaging',
          icon: MessageSquare,
          title: 'Centro de Mensajes',
          description: 'Comunícate con otros usuarios',
          steps: [
            'Ve a "Mensajería" o usa el botón de chat',
            'Selecciona un usuario de la lista',
            'Escribe tu mensaje',
            'Envía con Enter o el botón de enviar',
            'Las notificaciones te avisan de nuevos mensajes'
          ],
          tips: [
            'Los mensajes se sincronizan en tiempo real',
            'Puedes adjuntar archivos desde la sección de archivos'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        },
        {
          id: 'file-sharing',
          icon: Share2,
          title: 'Compartir Archivos',
          description: 'Envía y recibe archivos con otros usuarios',
          steps: [
            'Ve a "Compartir Archivos"',
            'Selecciona el destinatario',
            'Adjunta el archivo',
            'Añade un mensaje opcional',
            'El destinatario recibe notificación',
            'Puedes ver el estado de descarga'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        },
        {
          id: 'notifications',
          icon: Bell,
          title: 'Centro de Notificaciones',
          description: 'Gestiona todas tus notificaciones',
          steps: [
            'Haz clic en el icono de campana',
            'Verás notificaciones de: partes pendientes, tareas, archivos',
            'Haz clic en una notificación para acceder al contenido',
            'Usa "Marcar todas" para limpiar notificaciones',
            'Descarga partes directamente desde las notificaciones'
          ],
          tips: [
            'Los roles de oficina reciben notificaciones agrupadas por obra',
            'Configura las notificaciones push en ajustes'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        }
      ]
    },
    {
      id: 'management',
      title: 'Gestión y Administración',
      description: 'Configuración de organización, usuarios y obras',
      icon: Settings,
      color: 'text-gray-600',
      gradient: 'from-gray-500/20 to-gray-600/10',
      features: [
        {
          id: 'user-management',
          icon: Users,
          title: 'Gestión de Usuarios',
          description: 'Administra usuarios, roles y permisos',
          steps: [
            'Ve a "Gestión" > "Usuarios"',
            'Comparte el código de invitación con nuevos usuarios',
            'Aprueba usuarios pendientes y asigna roles',
            'Asigna obras específicas a cada usuario',
            'Gestiona permisos según el rol'
          ],
          tips: [
            'Master: acceso total a todo el sistema',
            'Admin: gestión completa de la organización',
            'Jefe de Obra: gestiona sus obras asignadas',
            'Encargado: crea y edita partes de trabajo',
            'Oficina: solo visualización de partes aprobados',
            'Lector: solo lectura sin edición'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'organization',
          icon: Building2,
          title: 'Configuración de Organización',
          description: 'Datos legales y branding',
          steps: [
            'Ve a "Gestión" > "Organización"',
            'Completa datos legales: NIF/CIF, Razón Social',
            'Añade información de contacto',
            'Sube el logo de tu empresa',
            'Selecciona colores corporativos',
            'Los cambios se aplican en toda la app y PDFs'
          ],
          roles: ['master', 'admin']
        },
        {
          id: 'works-management',
          icon: Briefcase,
          title: 'Gestión de Obras',
          description: 'Crea y administra obras con geolocalización',
          steps: [
            'Ve a "Obras" en el menú',
            'Haz clic en "Nueva Obra"',
            'Completa: número, nombre, dirección, presupuesto',
            'Usa "Capturar GPS" para geolocalizar automáticamente',
            'O escribe la dirección y "Buscar coordenadas"',
            'Añade fechas de inicio y fin',
            'Asigna usuarios responsables',
            'La obra estará disponible en partes y en el Radar'
          ],
          tips: [
            'La dirección se concatena automáticamente al guardar',
            'Las obras geolocalizadas aparecen en el mapa Radar'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'company-portfolio',
          icon: Building,
          title: 'Cartera de Empresas',
          description: 'Gestiona contactos de proveedores, clientes y subcontratas',
          steps: [
            'Ve a "Obras" > "Cartera de Empresas"',
            'Crea tipos de empresa personalizados',
            'Añade empresas con datos completos: NIF, contacto, dirección',
            'Organiza por tipos: proveedor, subcontrata, cliente',
            'Exporta la cartera a Excel',
            'Importa contactos desde archivos VCF'
          ],
          roles: ['master', 'admin', 'site_manager']
        }
      ]
    },
    {
      id: 'security',
      title: 'Seguridad',
      description: 'Protección de datos y cumplimiento normativo',
      icon: Shield,
      color: 'text-purple-600',
      gradient: 'from-purple-500/20 to-purple-600/10',
      features: [
        {
          id: 'data-security',
          icon: Lock,
          title: 'Seguridad de Datos',
          description: 'Cómo protegemos tu información',
          steps: [
            'Cifrado de datos en tránsito y reposo',
            'Políticas RLS a nivel de base de datos',
            'Cada usuario solo ve datos de su organización',
            'Autenticación JWT segura',
            'Validación de contraseñas contra bases de datos de fugas'
          ],
          tips: [
            'RLS (Row Level Security) previene accesos no autorizados',
            'JWT garantiza sesiones seguras',
            'Los datos nunca se comparten entre organizaciones'
          ],
          roles: ['master', 'admin']
        },
        {
          id: 'compliance',
          icon: Shield,
          title: 'Cumplimiento Normativo',
          description: 'Estándares de seguridad implementados',
          steps: [
            'ISO 27001: Gestión de seguridad de la información',
            'GDPR: Protección de datos personales (Europa)',
            'SOC 2: Controles de seguridad y disponibilidad',
            'Control de acceso basado en roles',
            'Auditoría de acciones críticas'
          ],
          roles: ['master', 'admin']
        }
      ]
    },
    {
      id: 'offline',
      title: 'Modo Offline',
      description: 'Trabaja sin conexión a internet',
      icon: WifiOff,
      color: 'text-slate-600',
      gradient: 'from-slate-500/20 to-slate-600/10',
      features: [
        {
          id: 'offline-mode',
          icon: WifiOff,
          title: 'Trabajar Sin Conexión',
          description: 'La app funciona incluso sin internet',
          steps: [
            'Los datos se guardan automáticamente en caché local',
            'Cuando pierdas conexión, verás un indicador offline',
            'Puedes consultar partes guardados previamente',
            'Los cambios se sincronizarán automáticamente al reconectar',
            'Exporta datos importantes antes de trabajar offline'
          ],
          tips: [
            'La PWA permite instalación en dispositivos móviles',
            'El indicador de red te mantiene informado',
            'Algunas funciones requieren conexión (escáner IA, chat)'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'office-role',
      title: 'Rol de Oficina',
      description: 'Funciones específicas para personal administrativo',
      icon: Printer,
      color: 'text-teal-600',
      gradient: 'from-teal-500/20 to-teal-600/10',
      features: [
        {
          id: 'office-features',
          icon: Printer,
          title: 'Funciones de Oficina',
          description: 'Acceso optimizado para procesamiento administrativo',
          steps: [
            'Visualiza partes de trabajo completados y aprobados',
            'Exporta masivamente partes semanales y mensuales',
            'Accede al análisis económico y reportes guardados',
            'Recibe notificaciones agrupadas por obra',
            'Información detallada: obra, número y fecha de cada parte',
            'Los grupos de partes se expanden automáticamente'
          ],
          tips: [
            'NO puedes crear, editar ni clonar partes',
            'NO tienes acceso a informes avanzados ni gestión de usuarios',
            'NO ves el asistente IA flotante',
            'Enfoque exclusivo en procesamiento y exportación',
            'Solo puedes exportar partes aprobados'
          ],
          roles: ['ofi']
        }
      ]
    },
    {
      id: 'reader-role',
      title: 'Rol de Lector',
      description: 'Acceso de solo lectura al sistema',
      icon: BookOpen,
      color: 'text-gray-500',
      gradient: 'from-gray-400/20 to-gray-500/10',
      features: [
        {
          id: 'reader-features',
          icon: BookOpen,
          title: 'Funciones de Lector',
          description: 'Visualización sin capacidad de edición',
          steps: [
            'Visualiza partes de trabajo de obras asignadas',
            'Consulta información general del sistema',
            'Accede al centro de ayuda y documentación',
            'No puedes crear, editar ni eliminar ningún registro'
          ],
          tips: [
            'Este rol es para supervisión y consulta',
            'Contacta a un administrador si necesitas más permisos',
            'Puedes usar la mensajería para comunicarte con el equipo'
          ],
          roles: ['reader']
        }
      ]
    }
  ];

  // Filtrar categorías según el rol del usuario
  const filteredCategories = featureCategories.filter(category =>
    category.features.some(feature => feature.roles.includes(currentRole))
  ).map(category => ({
    ...category,
    features: category.features.filter(feature => feature.roles.includes(currentRole))
  }));

  // Filtrar por búsqueda
  const searchFilteredCategories = searchQuery
    ? filteredCategories.map(category => ({
        ...category,
        features: category.features.filter(feature =>
          feature.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          feature.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          feature.steps.some(step => step.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      })).filter(category => category.features.length > 0)
    : filteredCategories;

  const faqItems = [
    { q: 'isMyDataSecure', a: 'isMyDataSecureAnswer' },
    { q: 'whatIsRLS', a: 'whatIsRLSAnswer' },
    { q: 'whatIsJWTAuth', a: 'whatIsJWTAuthAnswer' },
    { q: 'complianceStandards', a: 'complianceStandardsAnswer' },
    { q: 'canEditAfterSave', a: 'canEditAfterSaveAnswer' },
    { q: 'autoSync', a: 'autoSyncAnswer' },
    { q: 'approveReports', a: 'approveReportsAnswer' },
    { q: 'manageLanguage', a: 'manageLanguageAnswer' },
    { q: 'exportFormats', a: 'exportFormatsAnswer' },
    { q: 'offlineUse', a: 'offlineUseAnswer' },
    { q: 'recoverPassword', a: 'recoverPasswordAnswer' },
    { q: 'duplicateReport', a: 'duplicateReportAnswer' },
    { q: 'whatIsSubscription', a: 'whatIsSubscriptionAnswer' },
    { q: 'howToUpdateApp', a: 'howToUpdateAppAnswer' },
    { q: 'customBranding', a: 'customBrandingAnswer' },
    { q: 'aiAnalysisFeatures', a: 'aiAnalysisFeaturesAnswer' },
    { q: 'ocrScanning', a: 'ocrScanningAnswer' },
    { q: 'economicReports', a: 'economicReportsAnswer' },
    { q: 'advancedReports', a: 'advancedReportsAnswer' },
    { q: 'duplicateInvoices', a: 'duplicateInvoicesAnswer' },
    { q: 'autoRelocateInvoices', a: 'autoRelocateInvoicesAnswer' },
    { q: 'globalDuplicateCheck', a: 'globalDuplicateCheckAnswer' },
    { q: 'autoCreateWorkReport', a: 'autoCreateWorkReportAnswer' },
    { q: 'rentalMachineryManagement', a: 'rentalMachineryManagementAnswer' },
    { q: 'voiceCommands', a: 'voiceCommandsAnswer' },
    { q: 'howToNotifications', a: 'howToNotificationsAnswer' },
  ];

  const filteredFaq = faqItems.filter(item =>
    searchQuery === '' || 
    t(`help.${item.q}`).toLowerCase().includes(searchQuery.toLowerCase()) ||
    t(`help.${item.a}`).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFeatureDetail = (feature: FeatureCard) => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
        <feature.icon className="h-6 w-6 text-primary mt-0.5 shrink-0" />
        <div>
          <h4 className="font-semibold text-lg">{feature.title}</h4>
          <p className="text-muted-foreground text-sm">{feature.description}</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <h5 className="font-medium flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          Pasos a seguir
        </h5>
        <div className="space-y-2">
          {feature.steps.map((step, index) => (
            <div 
              key={index} 
              className="flex items-start gap-3 p-3 rounded-lg border bg-background hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
                {index + 1}
              </div>
              <p className="text-sm pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {feature.tips && feature.tips.length > 0 && (
        <div className="space-y-3 mt-4">
          <h5 className="font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Consejos útiles
          </h5>
          <div className="grid gap-2">
            {feature.tips.map((tip, index) => (
              <div 
                key={index} 
                className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <CheckCircle2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-100">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button 
        variant="outline" 
        size="sm" 
        className="mt-4"
        onClick={() => setExpandedFeature(null)}
      >
        ← Volver a la categoría
      </Button>
    </div>
  );

  const renderCategoryContent = (category: FeatureCategory) => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className={`p-4 rounded-lg bg-gradient-to-r ${category.gradient} border`}>
        <div className="flex items-center gap-3">
          <category.icon className={`h-8 w-8 ${category.color}`} />
          <div>
            <h3 className="font-bold text-lg">{category.title}</h3>
            <p className="text-muted-foreground text-sm">{category.description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {category.features.map((feature) => (
          <button
            key={feature.id}
            onClick={() => setExpandedFeature(feature.id)}
            className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-all duration-200 hover:shadow-md text-left group"
          >
            <div className={`p-2 rounded-lg ${category.gradient}`}>
              <feature.icon className={`h-5 w-5 ${category.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium group-hover:text-primary transition-colors">{feature.title}</h4>
              <p className="text-sm text-muted-foreground truncate">{feature.description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>

      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setSelectedCategory(null)}
      >
        ← Volver a categorías
      </Button>
    </div>
  );

  const renderCategories = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {searchFilteredCategories.map((category) => (
        <button
          key={category.id}
          onClick={() => setSelectedCategory(category.id)}
          className={`p-4 rounded-xl border bg-gradient-to-br ${category.gradient} hover:shadow-lg transition-all duration-300 text-left group hover:-translate-y-1`}
        >
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-background/80 shadow-sm">
              <category.icon className={`h-6 w-6 ${category.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold group-hover:text-primary transition-colors">{category.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{category.description}</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span>{category.features.length}</span>
                <span>guías disponibles</span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header con búsqueda */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl sm:text-3xl flex items-center gap-2">
                <HelpCircle className="h-7 w-7 text-primary" />
                {t('help.title')}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {t('help.description')}
              </CardDescription>
            </div>
            <Badge className={
              isMaster ? "bg-purple-100 text-purple-800 border-purple-300 border-2" :
              isAdmin ? "bg-destructive/10 text-destructive border-destructive/30" :
              isSiteManager ? "bg-primary/10 text-primary border-primary/30" :
              isForeman ? "bg-secondary text-secondary-foreground" :
              isOfi ? "bg-teal-100 text-teal-800 border-teal-300" :
              "bg-muted text-muted-foreground"
            }>
              {isMaster ? t('roles.master') :
               isAdmin ? t('roles.admin') :
               isSiteManager ? t('roles.siteManager') :
               isForeman ? t('roles.foreman') :
               isOfi ? t('roles.ofi') :
               t('roles.reader')}
            </Badge>
          </div>
          
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('help.searchHelp')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCategory(null);
                setExpandedFeature(null);
              }}
              className="pl-10"
            />
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="features" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="features" className="text-xs sm:text-sm">
            <BookOpen className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">{t('help.features')}</span>
            <span className="sm:hidden">{t('help.guide')}</span>
          </TabsTrigger>
          <TabsTrigger value="faq" className="text-xs sm:text-sm">
            <HelpCircle className="h-4 w-4 mr-1 sm:mr-2" />
            <span>FAQ</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">{t('help.chat')}</span>
            <span className="sm:hidden">Chat</span>
          </TabsTrigger>
        </TabsList>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          {expandedFeature ? (
            (() => {
              const feature = searchFilteredCategories
                .flatMap(c => c.features)
                .find(f => f.id === expandedFeature);
              return feature ? renderFeatureDetail(feature) : null;
            })()
          ) : selectedCategory ? (
            (() => {
              const category = searchFilteredCategories.find(c => c.id === selectedCategory);
              return category ? renderCategoryContent(category) : null;
            })()
          ) : (
            <>
              {searchFilteredCategories.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No se encontraron resultados para "{searchQuery}"</p>
                    <Button 
                      variant="link" 
                      onClick={() => setSearchQuery('')}
                      className="mt-2"
                    >
                      Limpiar búsqueda
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                renderCategories()
              )}

              {/* Roles Section - Solo admin/master */}
              {(isMaster || isAdmin) && !searchQuery && (
                <Card className="mt-6 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      {t('help.permissionsRoles')}
                    </CardTitle>
                    <CardDescription>
                      Descripción de los roles y sus permisos en el sistema
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { role: 'master', desc: t('help.masterRole'), badge: 'bg-purple-100 text-purple-800 border-purple-300 border-2' },
                        { role: 'admin', desc: t('help.adminRole'), badge: 'bg-destructive/10 text-destructive' },
                        { role: 'siteManager', desc: t('help.siteManagerRole'), badge: 'bg-primary/10 text-primary' },
                        { role: 'foreman', desc: t('help.foremanRole'), badge: 'bg-secondary text-secondary-foreground' },
                        { role: 'ofi', desc: t('help.ofiRole'), badge: 'bg-teal-100 text-teal-800' },
                        { role: 'reader', desc: t('help.readerRole'), badge: 'bg-muted text-muted-foreground' },
                      ].map((item) => (
                        <div key={item.role} className="p-4 border rounded-lg hover:shadow-sm transition-shadow">
                          <Badge className={item.badge}>
                            {t(`roles.${item.role}`)}
                          </Badge>
                          <p className="text-sm text-muted-foreground mt-2">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* FAQ Tab */}
        <TabsContent value="faq" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              {filteredFaq.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No se encontraron preguntas para "{searchQuery}"</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaq.map((item, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left hover:no-underline">
                        <span className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                          {t(`help.${item.q}`)}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-sm sm:text-base text-muted-foreground pl-6">
                        {t(`help.${item.a}`)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              {!adminId ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">{t('help.noAdminAvailable')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.length > 0 && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearConversation}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        {t('help.clearConversation')}
                      </Button>
                    </div>
                  )}
                  <ScrollArea className="h-[300px] sm:h-[400px] w-full rounded-lg border p-4 bg-muted/30">
                    {loading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">{t('help.noMessages')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((message) => {
                          const isMe = message.from_user_id === currentUserId;
                          return (
                            <div
                              key={message.id}
                              className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}
                            >
                              <div className="flex items-start gap-2 max-w-[85%]">
                                {isMe && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                                    onClick={() => handleDeleteMessage(message.id)}
                                    title={t('help.deleteMessage')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                )}
                                <div
                                  className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                    isMe
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-background border'
                                  }`}
                                >
                                  <p className="font-medium text-xs mb-1 opacity-70">
                                    {isMe ? t('help.you') : t('help.administrator')}
                                  </p>
                                  <p className="break-words">{message.message}</p>
                                  <p className="text-xs opacity-60 mt-1.5">
                                    {new Date(message.created_at).toLocaleString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

                  <div className="flex gap-2">
                    <Textarea
                      placeholder={t('help.writeMessage')}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="min-h-[80px] text-sm resize-none"
                      disabled={sendingMessage}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                      size="icon"
                      className="h-[80px] w-14 shrink-0"
                    >
                      {sendingMessage ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

