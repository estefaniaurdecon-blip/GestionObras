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
  listContactUsersByTenant,
  type ApiUser,
} from '@/integrations/api/client';
import { getActiveTenantId } from '@/offline-db/tenantScope';
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
  Navigation,
  Copy
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
    void loadAdmin();
  }, [user?.id, user?.tenant_id, currentUserId]);

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
    if (!user || !currentUserId) {
      setAdminId(null);
      return;
    }

    try {
      const activeTenantId = await getActiveTenantId(user);
      if (!activeTenantId) {
        setAdminId(null);
        return;
      }

      const users = await listContactUsersByTenant(Number(activeTenantId));
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
            'Pulsa el botón "+ Nuevo Parte" en la cabecera de la lista',
            'Se abrirá el formulario con la fecha de hoy por defecto; cámbiala si es necesario',
            'Rellena el Nº de Obra y Nombre de la obra en la cabecera',
            'En la sección "Mano de Obra" añade grupos de trabajo: empresa, nombre, actividad y horas por trabajador',
            'En "Maquinaria de Subcontratas" registra empresa, tipo de máquina y horas',
            'En "Materiales" pulsa "+ Albarán" para cada proveedor y añade líneas de material o usa "Escanear IA"',
            'En "Subcontratas" añade empresas externas con la partida contratada y trabajadores asignados',
            'En "Observaciones e Incidencias" registra cualquier incidencia o nota relevante',
            'En la tarjeta inferior "Encargado y Jefe de Obra" rellena los nombres y horas del encargado',
            'Pulsa "Guardar" en la barra inferior; elige el estado: Completado, Faltan Datos o Faltan Albaranes'
          ],
          tips: [
            'Las secciones Mano de Obra, Maquinaria, Subcontratas y Observaciones cuentan para el progreso de completado',
            'El alquiler de maquinaria se rellena automáticamente desde el módulo de alquileres',
            'Puedes dictar observaciones con el botón de micrófono en esa sección'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'report-status',
          icon: CheckCircle2,
          title: 'Estados y Aprobación del Parte',
          description: 'Gestiona el estado y la aprobación de los partes',
          steps: [
            'Al guardar, el diálogo "Confirmar Estado" te ofrece tres opciones',
            '"Completado": el parte está terminado y listo para revisión',
            '"Faltan Datos": queda información por completar (se puede combinar con la siguiente)',
            '"Faltan Albaranes": faltan documentos de material por adjuntar',
            'Para aprobar un parte ya Completado, ábrelo y pulsa el botón "Aprobar"',
            'Un parte aprobado aparece con indicador azul en la lista',
            'Solo administradores y jefes de obra pueden aprobar partes'
          ],
          tips: [
            'Los partes Completados aparecen en verde; los pendientes en ámbar; los que faltan albaranes en rosa',
            'Las tarjetas de resumen de la lista muestran el % de completados y aprobados',
            'Un parte aprobado no se puede editar sin desaprobarlo primero'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'navigate-reports',
          icon: Navigation,
          title: 'Navegar entre Partes',
          description: 'Usa los controles de la cabecera para moverte entre partes',
          steps: [
            'Abre cualquier parte de trabajo desde la lista',
            'En la cabecera verás los botones "◀ Anterior" y "Siguiente ▶"',
            'El contador central muestra tu posición, por ejemplo: 3 / 15',
            'La secuencia de navegación depende del modo de vista activo en la lista',
            'Modo "Por encargado": navegas entre partes del mismo encargado',
            'Modo "Semanal": navegas entre partes de la misma semana',
            'Modo "Mensual": navegas entre partes del mismo mes',
            'Pulsa "◀ Volver" para regresar a la lista sin cambiar el filtro activo'
          ],
          tips: [
            'Selecciona el modo de vista en la lista antes de abrir un parte para controlar qué secuencia navegas',
            'Los botones Anterior/Siguiente se desactivan en el primer y último parte de la secuencia'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        },
        {
          id: 'export-reports',
          icon: Download,
          title: 'Exportar Partes (PDF y Excel)',
          description: 'Descarga partes individuales o en lote',
          steps: [
            'Para exportar un parte individual, ábrelo y usa los botones "PDF" o "Excel" de la barra inferior',
            'Al pulsar PDF aparece un diálogo: "Descargar sin imágenes" o "Descargar con imágenes de albaranes"',
            'El Excel individual genera múltiples hojas: Mano de Obra, Maquinaria, Materiales, Subcontratas, etc.',
            'Para exportación masiva, en la lista activa las casillas de selección de cada parte',
            'Selecciona los partes que necesitas (se muestra "X / Y seleccionados")',
            'Usa "Descargar PDFs (ZIP)" o "Descargar Excels (ZIP)" para obtener todos en un archivo comprimido',
            'El archivo ZIP se descarga con nombre del tipo: Partes_PDF_2025-03-17.zip'
          ],
          tips: [
            'Los PDF incluyen el logo y color de marca de tu organización',
            'Si eres usuario de Oficina puedes exportar por rango de fechas desde la lista'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman', 'ofi']
        },
        {
          id: 'clone-report',
          icon: ClipboardList,
          title: 'Clonar Partes',
          description: 'Duplica un parte existente para reutilizar su información',
          steps: [
            'En la lista de partes localiza el parte que quieres duplicar',
            'Pulsa el icono de clonar (dos hojas) que aparece en la fila del parte',
            'Se abre el diálogo "Clonar Parte" con el nombre de la obra',
            'Selecciona la fecha para el nuevo parte (por defecto el día siguiente)',
            'Elige qué secciones incluir: Materiales (activo por defecto), Gestión de Residuos (activo), Imágenes de albaranes (desactivado), Firmas (desactivado)',
            'Los datos de texto (personal, maquinaria, subcontratas, observaciones) se copian siempre',
            'Pulsa "Clonar Parte" para crear la copia',
            'El parte clonado aparece con un aviso amarillo: "Parte clonado – Revisión necesaria"'
          ],
          tips: [
            'Revisa y actualiza los datos del parte clonado antes de guardarlo; no lo des por válido sin revisión',
            'Activa "Auto-clonar al día siguiente" dentro del parte para que se cree automáticamente cada noche'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'comments-section',
          icon: MessageSquare,
          title: 'Comentarios en Partes',
          description: 'Deja notas colaborativas visibles para todo el equipo',
          steps: [
            'Abre cualquier parte de trabajo',
            'Desplázate hasta la sección "Comentarios" (icono de bocadillo)',
            'Escribe tu comentario o pregunta en el campo de texto',
            'Pulsa "Publicar comentario" para enviarlo',
            'Los comentarios muestran el nombre del autor y el tiempo transcurrido (ej: "hace 5 minutos")',
            'La sección se refresca automáticamente cada 10 segundos'
          ],
          tips: [
            'Usa los comentarios para avisar al equipo de incidencias sin salir del parte',
            'Todos los usuarios con acceso al parte pueden ver y publicar comentarios'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'active-repasos-widget',
          icon: Wrench,
          title: 'Widget de Repasos Activos',
          description: 'Consulta los repasos pendientes de la obra mientras editas el parte',
          steps: [
            'Al abrir un parte, comprueba si aparece el widget de repasos activos',
            'El widget muestra repasos en estado pendiente (ámbar) y en proceso (azul)',
            'Puedes ver las horas estimadas y las horas reales consumidas por repaso',
            'También indica la empresa asignada a cada repaso',
            'Para gestionar los repasos accede a Obras → pestaña Repasos de esa obra'
          ],
          tips: [
            'El widget sólo aparece si la obra tiene repasos activos; si no hay ninguno no se muestra',
            'Es informativo: no puedes editar repasos directamente desde el parte'
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
          description: 'Escanea albaranes y facturas para añadir materiales automáticamente',
          steps: [
            'Dentro del parte, en la sección "Materiales", pulsa "+ Albarán" para crear un grupo',
            'En ese grupo pulsa el botón "Escanear IA"',
            'Captura una foto del albarán con la cámara o selecciona una imagen de la galería',
            'La IA extrae: proveedor, número de albarán, fecha, líneas de material con cantidades y precios',
            'Se abre el diálogo de revisión donde puedes ver la confianza de cada campo detectado',
            'Revisa y corrige los datos si es necesario; pulsa "Aplicar" para añadirlos al parte',
            'Si el albarán contiene solo servicios (sin artículos) aparece un diálogo específico para confirmar el servicio',
            'Si hay artículos sin precio, se te pedirá que describas el tipo de material o servicio'
          ],
          tips: [
            'Asegúrate de tener buena iluminación; evita sombras sobre el documento',
            'Si el sistema detecta que el albarán ya fue escaneado anteriormente, te ofrece la opción de sobrescribir o cancelar',
            'Si hay diferencia de precio superior al 20% entre el documento y el cálculo, se muestra un aviso para que elijas cuál mantener'
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
          title: 'Dictado por Voz en Observaciones',
          description: 'Dicta observaciones e incidencias usando la voz',
          steps: [
            'Abre un parte de trabajo y despliega la sección "Observaciones e Incidencias"',
            'Pulsa el botón de micrófono que aparece en esa sección',
            'Habla con claridad; la transcripción aparece en tiempo real mientras dictas',
            'Pulsa de nuevo el micrófono para detener el dictado',
            'El texto transcrito se añade al campo de observaciones; revísalo antes de guardar'
          ],
          tips: [
            'El reconocimiento de voz está configurado en español',
            'Funciona mejor en entornos con poco ruido de fondo',
            'Puedes dictar varias frases seguidas; el sistema acumula el texto'
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
      id: 'obras',
      title: 'Obras',
      description: 'Gestión completa de obras: crear, inventario, maquinaria, repasos y postventas',
      icon: Building2,
      color: 'text-orange-600',
      gradient: 'from-orange-500/20 to-orange-600/10',
      features: [
        {
          id: 'create-work',
          icon: Briefcase,
          title: 'Crear y Gestionar Obras',
          description: 'Crea nuevas obras y gestiona el listado completo',
          steps: [
            'Ve a la pestaña "Obras" en el menú principal',
            'Pulsa "+ Nuevo registro" para crear una nueva obra',
            'Módulo 1 – Información General: rellena Número de Obra (*), Plazo de Ejecución, Nombre (*), Dirección, Promotor, Presupuesto (€), Fecha de Inicio y Fecha de Fin',
            'Módulo 2 – Descripción y Contacto: añade descripción general, persona de contacto, teléfono y email',
            'Módulo 3 – Ubicación: introduce calle, población, provincia y país (España por defecto)',
            'Pulsa "Buscar Coordenadas desde Dirección" para geolocalizar automáticamente via OpenStreetMap',
            'O pulsa "Capturar Ubicación GPS Actual" para usar tu posición en tiempo real',
            'Pulsa "Añadir" para guardar; la obra aparecerá en la lista y en el Radar de Obras',
            'Para editar, pulsa el icono de lápiz de la fila; para eliminar, el icono de papelera (con confirmación)'
          ],
          tips: [
            'Solo admin, jefe de obra y master pueden crear y editar obras',
            'Cada fila tiene un menú ⚙ con accesos directos a Inventario, Maq. Alquiler, Repasos y Post-Venta de esa obra',
            'Usa "Asignar encargado" en el menú ⚙ para vincular usuarios a la obra; solo los usuarios asignados verán esa obra en sus partes',
            'Las obras geolocalizadas aparecen como marcadores en el Radar de Obras'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'work-inventory',
          icon: Package,
          title: 'Inventario de Obra',
          description: 'Consulta y gestiona los materiales y herramientas de cada obra',
          steps: [
            'Desde la lista de obras pulsa el menú ⚙ → "Inventario", o entra en la obra y pulsa el botón "Inventario"',
            'El inventario se organiza por proveedor y albarán; se recalcula automáticamente desde los partes completados',
            'Usa los paneles superiores para activar funciones: "Acciones de Obra", "Mantenimiento" y "Búsqueda"',
            'Panel Búsqueda: filtra por texto, mes y año; pulsa "Limpiar filtros" para resetear',
            'Usa las pestañas para navegar: Dashboard (resumen), Albaranes (documentos pendientes), Materiales y Herramientas',
            'Para editar un elemento pulsa el icono de lápiz; el formulario tiene 15 campos: nombre, código, categoría, marca, modelo, cantidad, unidad, precio, nº albarán, lote, proveedor, ubicación, estado, fechas entrada/salida y observaciones',
            'Panel Acciones de Obra: "Recalcular desde partes" reprocesa todos los partes completados para actualizar cantidades',
            'Panel Acciones de Obra: "Exportar Excel" descarga el inventario completo; "Exportar Albaranes" descarga los documentos',
            'Panel Mantenimiento: "Limpiar Servicios" elimina líneas de servicio/alquiler; "Validar y Corregir" detecta y corrige inconsistencias'
          ],
          tips: [
            'El inventario refleja lo registrado en los partes; si falta algo revisa que el parte esté en estado "Completado"',
            'Para fusionar proveedores duplicados: activa las casillas de los proveedores que quieres unir y pulsa el botón "Fusionar (N)" que aparece en el panel Mantenimiento — el resultado adopta el nombre del primero seleccionado',
            'La exportación global incluye toda la obra independientemente de los filtros activos',
            'El campo "Estado" del ítem puede ser: Nuevo (verde), Usado (amarillo) o Dañado (rojo)'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'rental-machinery',
          icon: Truck,
          title: 'Maquinaria de Alquiler',
          description: 'Registra y controla la maquinaria alquilada en cada obra',
          steps: [
            'Desde la lista de obras pulsa el menú ⚙ → "Maq. alquiler", o entra en la obra y pulsa el botón "Maq. Alquiler"',
            'Pulsa "+ Añadir maquinaria" para desplegar el formulario de alta',
            'Rellena los campos obligatorios: Tipo de maquinaria (*), Proveedor (*), Número de máquina (*), Fecha de entrega (*)',
            'Añade opcionalmente: Tarifa diaria (€), Fecha de baja y Notas',
            'Para añadir imagen: pulsa "Tomar foto" para usar la cámara o "Subir archivo" para seleccionar desde galería',
            'Pulsa "Añadir" para guardar; la máquina aparecerá en la sección de Alquiler de Maquinaria del parte diario en modo lectura',
            'Cada entrada muestra una tarjeta con: fecha entrega, fecha baja (o "En uso"), días calculados y coste total (días × tarifa diaria)',
            'Para asignar un operador a una máquina, pulsa el botón "Asignar" de esa máquina',
            'Expande "Ver historial de asignaciones de operadores" para consultar el historial completo de cada máquina'
          ],
          tips: [
            'Solo admin y jefe de obra pueden acceder a esta sección',
            'Si no introduces fecha de baja, la máquina aparece como "En uso" y sigue acumulando días',
            'Las máquinas activas se muestran automáticamente en la sección de alquiler del parte; no es necesario añadirlas manualmente'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'manage-repasos',
          icon: Wrench,
          title: 'Repasos de Obra',
          description: 'Crea y controla trabajos de repaso en obras',
          steps: [
            'Desde la lista de obras pulsa el menú ⚙ → "Repasos", o entra en la obra y pulsa el botón "Repasos"',
            'Pulsa "+ Añadir repaso" para registrar un nuevo repaso o desperfecto',
            'Rellena la descripción, empresa asignada, horas estimadas y estado inicial (Pendiente por defecto)',
            'Añade grupos de subcontratas si aplica: empresa, trabajadores (nombre y horas) y maquinaria (tipo y horas)',
            'Las horas reales se actualizan editando el repaso cuando se complete el trabajo',
            'El código se asigna automáticamente (REP-001, REP-002…)',
            'Cambia el estado a "En Proceso" cuando empiece el trabajo y a "Completado" al finalizar',
            'Usa los botones "Excel" y "PDF" para exportar el listado'
          ],
          tips: [
            'La cabecera muestra métricas en tiempo real: Pendientes, En Proceso, Completados y Horas Totales',
            'Los repasos Pendientes y En Proceso aparecen en el widget informativo dentro del parte de trabajo de esa obra',
            'Las horas totales se calculan sumando horas de trabajadores y maquinaria de los grupos de subcontratas'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'manage-postventas',
          icon: UserCheck,
          title: 'Postventas de Obra',
          description: 'Registra y gestiona incidencias postventa y garantías',
          steps: [
            'Desde la lista de obras pulsa el menú ⚙ → "Post-venta", o entra en la obra y pulsa el botón "Post-Venta"',
            'Pulsa "+ Añadir postventa" para registrar una nueva incidencia o solicitud del cliente',
            'Describe el problema, asigna empresa responsable y horas estimadas',
            'El estado inicial es Pendiente; cambia a "En Proceso" cuando se trabaje en ello y a "Completado" al resolver',
            'Añade grupos de subcontratas con empresa, trabajadores y maquinaria si aplica',
            'Exporta el listado con los botones "Excel" y "PDF"'
          ],
          tips: [
            'Los colores de estado son distintos a los de repasos: Pendiente en púrpura, En Proceso en índigo, Completado en esmeralda',
            'Diferencia clave: repasos son correcciones internas de obra; postventas son incidencias comunicadas por el cliente final'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'repasos-photos',
          icon: Camera,
          title: 'Fotos de Antes/Después',
          description: 'Documenta visualmente repasos y postventas con fotos',
          steps: [
            'Abre el diálogo de creación o edición de un repaso o postventa',
            'Localiza las dos áreas de imagen: "Antes" y "Después"',
            'Pulsa el icono de cámara en el área "Antes" para capturar o seleccionar la foto del estado inicial',
            'Al terminar el trabajo, edita el registro y añade la foto en el área "Después"',
            'Pulsa la miniatura para verla a pantalla completa; usa el botón X para eliminarla si es incorrecta',
            'Al guardar, las imágenes se suben y quedan asociadas al registro'
          ],
          tips: [
            'Tamaño máximo por imagen: 10 MB; solo se aceptan archivos de imagen (jpg, png, etc.)',
            'Las miniaturas de ambas fotos aparecen directamente en la tabla del listado de repasos/postventas'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        }
      ]
    },
    {
      id: 'access-control',
      title: 'Control de Accesos',
      description: 'Registra entradas y salidas de personal y maquinaria con firma digital',
      icon: UserCheck,
      color: 'text-red-600',
      gradient: 'from-red-500/20 to-red-600/10',
      features: [
        {
          id: 'access-report',
          icon: ClipboardList,
          title: 'Crear Control de Accesos',
          description: 'Registra entradas y salidas con todos los campos de trazabilidad',
          steps: [
            'Ve a "Control de Accesos" en el menú y pulsa "+ Nuevo Registro"',
            'Selecciona la obra en el desplegable (si solo tienes una asignada se rellena automáticamente)',
            'Rellena el nombre del responsable y sus horas de entrada y salida',
            'En la sección "Personal" pulsa "+ Añadir persona": rellena nombre, DNI, empresa, actividad y horas de entrada/salida',
            'El DNI es obligatorio y único por control: si ya existe ese DNI se te avisará',
            'En la sección "Maquinaria" pulsa "+ Añadir maquinaria": rellena tipo, matrícula, empresa, operador y horas de entrada/salida',
            'Añade observaciones generales si es necesario',
            'Pulsa "Guardar" para registrar el control; los cambios se autoguardan cada 30 segundos si hay obra y responsable'
          ],
          tips: [
            'El borrador se guarda localmente cada segundo; si cierras la app por accidente, al volver se recupera automáticamente',
            'Si solo tienes una obra asignada, se selecciona sola al abrir el formulario',
            'Puedes generar el PDF del control directamente desde el formulario con el botón "PDF"; en Android aparece un botón para compartirlo al instante'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'access-signature',
          icon: UserCheck,
          title: 'Firma Digital del Trabajador',
          description: 'Captura la firma de cada persona directamente en el control',
          steps: [
            'Al añadir o editar una entrada de personal, desplázate hasta la sección "Firma"',
            'Se abre un área de firma táctil donde el trabajador puede firmar con el dedo o el ratón',
            'Una vez firmado, la firma queda asociada a esa persona en el control',
            'Pulsa el botón de borrar (X) si necesitas repetir la firma',
            'La firma aparece en el PDF generado junto a los datos del trabajador'
          ],
          tips: [
            'Para mayor comodidad usa la pantalla en horizontal al firmar en móvil',
            'La firma se guarda en base64; no ocupa espacio extra en el servidor',
            'Si un trabajador no puede firmar en el momento, puedes guardar el control sin firma y editarlo después'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'access-copy',
          icon: Copy,
          title: 'Copiar Datos de Otro Control',
          description: 'Importa personal y maquinaria de un control anterior en 3 pasos',
          steps: [
            'Dentro del formulario de un control, pulsa el botón "Copiar datos"',
            'Paso 1 – Seleccionar control: busca entre los controles existentes por nombre de obra, responsable o fecha',
            'Paso 2 – Seleccionar entradas: elige individualmente qué personas y qué máquinas quieres importar; puedes modificar las horas de entrada/salida en este paso',
            'Paso 3 – Confirmar: si hay entradas duplicadas (mismo DNI o matrícula) se te avisa antes de aplicar',
            'Pulsa "Aplicar" para añadir las entradas seleccionadas al control actual'
          ],
          tips: [
            'Es ideal para obras con la misma cuadrilla diaria: importa el día anterior y solo ajusta horas o bajas',
            'Los duplicados se detectan por DNI para personal y por matrícula para maquinaria',
            'Puedes sobreescribir las horas al importar sin modificar el control original'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'access-reports',
          icon: FileText,
          title: 'Informes Consolidados de Accesos',
          description: 'Genera informes periódicos agrupando varios controles',
          steps: [
            'En la pantalla de Control de Accesos pulsa "Generar Informe"',
            'Elige el período: Diario, Semanal, Mensual o Personalizado',
            'Filtra por obra (puedes seleccionar varias a la vez), responsable, semana, mes o fecha concreta',
            'El diálogo te muestra cuántos registros entrarán en el informe antes de generarlo',
            'Pulsa "Generar" para crear el PDF consolidado con todos los controles del período'
          ],
          tips: [
            'El informe consolida todas las personas y maquinaria del período seleccionado en un único documento',
            'Útil para entregar documentación de accesos a la propiedad o a la coordinación de seguridad',
            'Con el modo "Personalizado" puedes elegir exactamente qué fechas incluir'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'access-list',
          icon: BarChart3,
          title: 'Lista y Estadísticas de Controles',
          description: 'Visualiza los controles agrupados con métricas en tiempo real',
          steps: [
            'La lista agrupa los controles por fecha y dentro de cada fecha por obra (desplegables)',
            'Cada grupo muestra: nº de registros, personal único (deduplicado por DNI), maquinaria y nº de empresas',
            'Usa el filtro de obra y el filtro de rango de fechas en la cabecera para acotar la vista',
            'Pulsa el icono de lápiz para editar un control o el icono de copia para clonarlo a otra fecha',
            'Pulsa el icono de PDF para descargar el control individual directamente desde la lista'
          ],
          tips: [
            'El recuento de personal elimina automáticamente los DNIs duplicados para dar el número real de personas únicas',
            'Los grupos son colapsables: puedes plegar fechas antiguas para ver mejor los recientes'
          ],
          roles: ['master', 'admin', 'site_manager', 'foreman']
        },
        {
          id: 'access-import-export',
          icon: Download,
          title: 'Exportar e Importar Datos',
          description: 'Haz copias de seguridad o migra controles entre dispositivos',
          steps: [
            'En la lista de controles pulsa "Exportar datos" para descargar todos los controles en formato JSON',
            'Para restaurar o importar, pulsa "Importar datos" y selecciona el archivo JSON exportado previamente',
            'Los controles importados se añaden a los existentes; no se sobreescriben los actuales'
          ],
          tips: [
            'Útil para hacer copias de seguridad manuales o para trasladar datos entre dispositivos',
            'El archivo JSON contiene todos los campos incluyendo firmas digitales'
          ],
          roles: ['master', 'admin', 'site_manager']
        },
        {
          id: 'bulk-access',
          icon: Users,
          title: 'Eliminación Masiva',
          description: 'Selecciona y elimina múltiples registros a la vez',
          steps: [
            'En la lista de controles pulsa "Selección múltiple"',
            'Marca las casillas de los controles que quieres eliminar',
            'Dentro de cada grupo de obra puedes pulsar la casilla del encabezado para seleccionar todos los de esa obra',
            'Pulsa "Eliminar (N)" con el número de seleccionados y confirma en el diálogo',
            'Los registros se eliminarán permanentemente'
          ],
          tips: [
            'Esta acción no se puede deshacer; verifica bien antes de confirmar',
            'La selección es por obra dentro de una fecha, no por día completo'
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
            'Accede a "Radar" pulsando el icono de globo en la barra superior de la app',
            'Verás un mapa con marcadores de todas las obras geolocalizadas',
            'Obras activas en color primario, finalizadas en gris',
            'Haz clic en un marcador para ver información de la obra',
            'Desde el popup puedes eliminar la ubicación o ir a la gestión de esa obra'
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
            'En la sección de dirección, haz clic en "Capturar Ubicación GPS Actual"',
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
      id: 'economic',
      title: 'Gestión Económica',
      description: 'Valoración de partes, análisis de costes e informes financieros',
      icon: TrendingUp,
      color: 'text-emerald-600',
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      features: [
        {
          id: 'economic-pricing',
          icon: Briefcase,
          title: 'Valorar un Parte (Asignar Precios)',
          description: 'Asigna precios a los elementos de un parte para generar el informe económico',
          steps: [
            'Ve a "Gestión Económica" y selecciona la pestaña "Valorar Parte"',
            'Elige el encargado en el desplegable (buscable); a continuación selecciona el parte a valorar de los últimos 10 disponibles',
            'Verás cuatro secciones editables: Mano de Obra, Maquinaria, Materiales y Subcontratas',
            'En cada fila pulsa el icono de editar (lápiz) para abrir el diálogo de edición',
            'Mano de Obra: rellena nombre, actividad, horas y precio/hora (€); el total se calcula automáticamente',
            'Maquinaria: rellena tipo, actividad, horas y precio/hora (€)',
            'Materiales: rellena descripción, cantidad, unidad y precio/unidad (€)',
            'Subcontratas: elige si es por horas (trabajadores × horas × tarifa) o por cantidad (cantidad × precio/ud)',
            'El "Total del Parte" en la cabecera se actualiza en tiempo real sumando todas las categorías',
            'Pulsa "Guardar Precios" para crear el parte económico; se guardará y podrás verlo en "Informes Guardados"'
          ],
          tips: [
            'Solo se contabilizan importes con precio mayor a 0; puedes dejar en blanco los que no apliquen',
            'Los partes valorados aparecen en "Informes Guardados" con su total en euros',
            'Filtra por encargado para acotar la lista de partes y encontrar el que necesitas más rápido'
          ],
          roles: ['master', 'admin', 'site_manager', 'ofi']
        },
        {
          id: 'economic-analysis',
          icon: BarChart3,
          title: 'Análisis Económico',
          description: 'Visualiza costes y tendencias de todos los partes completados con gráficos y tablas',
          steps: [
            'Ve a "Gestión Económica" y selecciona la pestaña "Análisis"',
            'Elige la granularidad temporal: "Por Días", "Por Semanas" o "Por Meses"',
            'Filtra por obra concreta o deja "Todas las obras" para el global',
            'Las 4 tarjetas superiores muestran: Coste Total (€), Horas Totales, Nº de Partes y Coste Medio por Parte',
            'Explora las pestañas: Evolución (gráfico de líneas coste + horas), Distribución (tarta por categoría), Empresas (tabla y barras M.O. vs Maquinaria), Proveedores (materiales y alquiler), Tabla (resumen detallado por período)',
            'En la pestaña "Empresas" verás el ranking de empresas con sus horas y costes de mano de obra y maquinaria por separado',
            'En la pestaña "Proveedores" verás proveedores de materiales (nombre, nº artículos, coste) y empresas de alquiler (días, coste)',
            'Pulsa "Excel" o "PDF" para exportar el análisis completo'
          ],
          tips: [
            'El análisis solo incluye partes en estado "Completado"; los partes pendientes no se contabilizan',
            'Los costes de alquiler de maquinaria se calculan automáticamente por días × tarifa diaria',
            'Las subcontratas pueden ser por horas (trabajadores × horas × tarifa) o por cantidad (unidades × precio), según cómo se valoraron'
          ],
          roles: ['master', 'admin', 'site_manager', 'ofi']
        },
        {
          id: 'saved-reports',
          icon: FolderOpen,
          title: 'Informes Guardados',
          description: 'Consulta, descarga y gestiona los partes económicos ya valorados',
          steps: [
            'Ve a "Gestión Económica" y selecciona la pestaña "Informes Guardados"',
            'Elige la agrupación: "Día", "Semana" o "Mes"; los informes se organizan en grupos con su total de período',
            'Cada fila muestra: fecha, nombre y número de obra, encargado, jefe de obra y total en euros',
            'Pulsa el icono de Excel (hoja de cálculo) para descargar el informe en formato .xlsx: incluye una hoja de Resumen y una hoja por cada categoría con datos (Mano de Obra, Maquinaria, Materiales, Subcontratas)',
            'Pulsa el icono de PDF para descargar el informe con el logo de tu organización',
            'Pulsa el icono de papelera para eliminar un informe (se pide confirmación; la acción no se puede deshacer)'
          ],
          tips: [
            'El total de período (suma de todos los partes del grupo) aparece en la cabecera de cada grupo',
            'El Excel tiene el nombre: Parte_Económico_{nº_obra}_{fecha}.xlsx',
            'En Android el archivo se guarda en la carpeta de Descargas y aparece un botón para compartirlo directamente'
          ],
          roles: ['master', 'admin', 'site_manager', 'ofi']
        },
        {
          id: 'advanced-reports',
          icon: BarChart3,
          title: 'Informes Avanzados',
          description: 'Genera reportes detallados con filtros avanzados de fecha y obra',
          steps: [
            'Ve a "Informes Avanzados" desde el menú de Gestión Económica',
            'Selecciona el tipo de período: semanal, mensual, trimestral o personalizado',
            'Filtra por obra específica o incluye todas',
            'El informe incluye horas de encargado, trabajadores, maquinaria de subcontratas y de alquiler',
            'En el modo "Alquiler" puedes ajustar fechas y tarifas de las máquinas directamente en la tabla antes de exportar',
            'Exporta en formato Excel o PDF'
          ],
          tips: [
            'Útil para informes periódicos que van más allá de un parte individual',
            'El modo alquiler permite corregir tarifas sin modificar el registro original de la máquina'
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
            'Haz clic en el icono de mensajes del header (junto a notificaciones)',
            'Selecciona un usuario de la lista de contactos o conversaciones',
            'Escribe tu mensaje',
            'Envía con Enter o el botón de enviar',
            'Las notificaciones te avisan de nuevos mensajes'
          ],
          tips: [
            'Los mensajes se actualizan cada 15 segundos automáticamente',
            'Puedes adjuntar archivos directamente desde el icono del clip en el chat'
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
            'Aprueba usuarios pendientes y asigna roles',
            'Asigna obras específicas a cada usuario',
            'Gestiona permisos según el rol'
          ],
          tips: [
            'Super: acceso total a todo el sistema',
            'Admin: gestión completa de la organización',
            'Usuario: acceso según las obras y permisos asignados'
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

