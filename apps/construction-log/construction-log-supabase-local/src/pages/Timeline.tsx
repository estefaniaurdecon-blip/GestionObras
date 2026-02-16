import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isBefore, isAfter, isWithinInterval, differenceInDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Clock, Calendar, MoreVertical, Trash2, Loader2, CalendarIcon, Save, Plus, Pencil, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePhases, Phase } from '@/hooks/usePhases';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useTranslation } from 'react-i18next';

// Types for UI display phases
interface WorkPhase {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'in_progress' | 'completed';
  progress: number; // 0-100
  description?: string;
  responsible?: string;
  workName?: string;
}

// Mock data - used as fallback when no data in Supabase
const mockPhases: WorkPhase[] = [
  {
    id: '1',
    name: 'Cimentación',
    startDate: new Date(2026, 1, 2),
    endDate: new Date(2026, 1, 10),
    status: 'completed',
    progress: 100,
    description: 'Excavación y vertido de hormigón para cimientos',
    responsible: 'Juan García',
    workName: 'Edificio Central'
  },
  {
    id: '2',
    name: 'Estructura',
    startDate: new Date(2026, 1, 8),
    endDate: new Date(2026, 1, 20),
    status: 'in_progress',
    progress: 60,
    description: 'Montaje de estructura metálica principal',
    responsible: 'Pedro López',
    workName: 'Edificio Central'
  },
  {
    id: '3',
    name: 'Albañilería',
    startDate: new Date(2026, 1, 15),
    endDate: new Date(2026, 1, 28),
    status: 'in_progress',
    progress: 20,
    description: 'Levantamiento de muros y tabiques',
    responsible: 'Miguel Sánchez',
    workName: 'Edificio Central'
  },
  {
    id: '4',
    name: 'Instalaciones Eléctricas',
    startDate: new Date(2026, 1, 22),
    endDate: new Date(2026, 2, 5),
    status: 'pending',
    progress: 0,
    description: 'Cableado e instalación de cuadros eléctricos',
    responsible: 'Carlos Ruiz',
    workName: 'Edificio Central'
  },
  {
    id: '5',
    name: 'Fontanería',
    startDate: new Date(2026, 0, 25),
    endDate: new Date(2026, 1, 1),
    status: 'in_progress',
    progress: 40,
    description: 'Instalación de tuberías y sanitarios',
    responsible: 'Antonio Fernández',
    workName: 'Nave Industrial'
  },
  {
    id: '6',
    name: 'Acabados',
    startDate: new Date(2026, 2, 1),
    endDate: new Date(2026, 2, 15),
    status: 'pending',
    progress: 0,
    description: 'Pintura, revestimientos y carpintería',
    responsible: 'Laura Martín',
    workName: 'Edificio Central'
  },
];

// Helper to convert DB phase to UI phase
const convertToWorkPhase = (phase: Phase): WorkPhase => ({
  id: phase.id,
  name: phase.name,
  startDate: parseISO(phase.start_date),
  endDate: parseISO(phase.end_date),
  status: phase.status,
  progress: phase.progress,
  description: phase.description || undefined,
  responsible: phase.responsible || undefined,
  workName: phase.work_name || undefined,
});

const Timeline = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isMaster, isAdmin, isSiteManager, loading: permissionsLoading } = useUserPermissions();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPhase, setSelectedPhase] = useState<WorkPhase | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Phase management state
  const [editingPhase, setEditingPhase] = useState<WorkPhase | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [phaseToDelete, setPhaseToDelete] = useState<WorkPhase | null>(null);
  
  // Add phase dialog state
  const [addPhaseDialogOpen, setAddPhaseDialogOpen] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseStartDate, setNewPhaseStartDate] = useState<Date | undefined>(undefined);
  const [newPhaseEndDate, setNewPhaseEndDate] = useState<Date | undefined>(undefined);

  // Edit Sheet state
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    name: string;
    startDate: Date | undefined;
    endDate: Date | undefined;
    status: 'pending' | 'in_progress' | 'completed';
  }>({
    name: '',
    startDate: undefined,
    endDate: undefined,
    status: 'pending',
  });

  // Supabase hook for phases
  const { 
    phases: dbPhases, 
    isLoading, 
    updatePhaseName, 
    updatePhase,
    deletePhase, 
    createPhase,
    isUpdating, 
    isDeleting,
    isSaving,
    isCreating,
  } = usePhases();

  // Convert DB phases to UI format or use mock data as fallback
  const phases: WorkPhase[] = useMemo(() => {
    if (dbPhases.length > 0) {
      return dbPhases.map(convertToWorkPhase);
    }
    return mockPhases;
  }, [dbPhases]);

  // Calculate days of the current month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get phase status color
  const getPhaseColor = (phase: WorkPhase): { bg: string; border: string; text: string } => {
    const today = new Date();
    
    if (phase.status === 'completed') {
      return { 
        bg: 'bg-green-500/20', 
        border: 'border-green-500', 
        text: 'text-green-700 dark:text-green-400' 
      };
    }
    
    if (phase.status === 'in_progress') {
      // Check if delayed
      if (isAfter(today, phase.endDate)) {
        return { 
          bg: 'bg-red-500/20', 
          border: 'border-red-500', 
          text: 'text-red-700 dark:text-red-400' 
        };
      }
      return { 
        bg: 'bg-blue-500/20', 
        border: 'border-blue-500', 
        text: 'text-blue-700 dark:text-blue-400' 
      };
    }
    
    return { 
      bg: 'bg-muted/50', 
      border: 'border-muted-foreground/30', 
      text: 'text-muted-foreground' 
    };
  };

  // Get status badge
  const getStatusBadge = (phase: WorkPhase) => {
    const today = new Date();
    
    if (phase.status === 'completed') {
      return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/50">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Completada
      </Badge>;
    }
    
    if (phase.status === 'in_progress') {
      if (isAfter(today, phase.endDate)) {
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/50">
          <AlertTriangle className="h-3 w-3 mr-1" /> Retrasada
        </Badge>;
      }
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/50">
        <Clock className="h-3 w-3 mr-1" /> En curso
      </Badge>;
    }
    
    return <Badge variant="outline" className="bg-muted text-muted-foreground">
      <Calendar className="h-3 w-3 mr-1" /> Pendiente
    </Badge>;
  };

  // Calculate bar position and width
  const calculateBarStyle = (phase: WorkPhase) => {
    const dayWidth = 40; // pixels per day
    const startDiff = differenceInDays(phase.startDate, monthStart);
    const duration = differenceInDays(phase.endDate, phase.startDate) + 1;
    
    // Check if phase is visible in current month
    const phaseStart = phase.startDate < monthStart ? monthStart : phase.startDate;
    const phaseEnd = phase.endDate > monthEnd ? monthEnd : phase.endDate;
    
    if (phaseEnd < monthStart || phaseStart > monthEnd) {
      return null; // Not visible
    }
    
    const visibleStart = differenceInDays(phaseStart, monthStart);
    const visibleDuration = differenceInDays(phaseEnd, phaseStart) + 1;
    
    return {
      left: visibleStart * dayWidth,
      width: visibleDuration * dayWidth - 4, // -4 for padding
    };
  };

  // Open edit sheet when clicking on a bar
  const handlePhaseClick = (phase: WorkPhase) => {
    setSelectedPhase(phase);
    setEditFormData({
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
      status: phase.status,
    });
    setEditSheetOpen(true);
  };

  // Legacy: Open incident report sheet (from phase name click)
  const handlePhaseDetailsClick = (phase: WorkPhase) => {
    setSelectedPhase(phase);
    setIncidentDescription('');
    setSheetOpen(true);
  };

  const handleReportIncident = () => {
    if (!incidentDescription.trim()) {
      toast.error('Por favor, describe la incidencia');
      return;
    }
    
    toast.success('Incidencia reportada correctamente');
    setIncidentDescription('');
    setSheetOpen(false);
  };

  // Save phase changes from the edit sheet
  const handleSavePhaseChanges = async () => {
    if (!selectedPhase || !editFormData.name.trim() || !editFormData.startDate || !editFormData.endDate) {
      toast.error('Por favor, completa todos los campos');
      return;
    }

    // Validate dates
    if (isBefore(editFormData.endDate, editFormData.startDate)) {
      toast.error('La fecha de fin debe ser posterior a la de inicio');
      return;
    }

    try {
      await updatePhase({
        id: selectedPhase.id,
        name: editFormData.name.trim(),
        start_date: format(editFormData.startDate, 'yyyy-MM-dd'),
        end_date: format(editFormData.endDate, 'yyyy-MM-dd'),
        status: editFormData.status,
      });
      setEditSheetOpen(false);
      setSelectedPhase(null);
    } catch (error) {
      // Error toast is handled by the hook
      console.error('Failed to update phase:', error);
    }
  };

  // Handle add phase from dropdown menu
  const handleAddPhase = () => {
    setNewPhaseName('');
    // Set default dates: today as start, tomorrow as end (1 day visible bar)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    setNewPhaseStartDate(today);
    setNewPhaseEndDate(tomorrow);
    setAddPhaseDialogOpen(true);
  };

  const handleCreatePhase = async () => {
    if (!newPhaseName.trim()) {
      toast.error('Por favor, introduce un nombre para la partida');
      return;
    }

    if (!newPhaseStartDate || !newPhaseEndDate) {
      toast.error('Por favor, selecciona las fechas de inicio y fin');
      return;
    }

    if (isBefore(newPhaseEndDate, newPhaseStartDate)) {
      toast.error('La fecha de fin debe ser posterior a la de inicio');
      return;
    }

    try {
      await createPhase({
        name: newPhaseName.trim(),
        start_date: format(newPhaseStartDate, 'yyyy-MM-dd'),
        end_date: format(newPhaseEndDate, 'yyyy-MM-dd'),
      });
      setAddPhaseDialogOpen(false);
      setNewPhaseName('');
      setNewPhaseStartDate(undefined);
      setNewPhaseEndDate(undefined);
      toast.success('Partida creada');
    } catch (error) {
      console.error('Failed to create phase:', error);
    }
  };

  const handleDeletePhase = (phase: WorkPhase) => {
    setPhaseToDelete(phase);
    setDeleteDialogOpen(true);
  };

  const confirmDeletePhase = async () => {
    if (!phaseToDelete) return;
    
    try {
      await deletePhase(phaseToDelete.id);
      setDeleteDialogOpen(false);
      setPhaseToDelete(null);
    } catch (error) {
      // Error toast is handled by the hook
      console.error('Failed to delete phase:', error);
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  // Check if user has permission to view the timeline
  const hasAccess = isMaster || isAdmin || isSiteManager;

  // Show loading state while checking permissions
  if (permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Show access denied if user doesn't have permission
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Acceso Restringido</h2>
            <p className="text-muted-foreground mb-6">
              El diagrama de Gantt solo está disponible para Jefes de Obra y Administradores.
            </p>
            <Button onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">Cronograma</h1>
          </div>
          
          {/* Month Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth('prev')}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: es })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth('next')}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="p-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Diagrama de Gantt</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex overflow-hidden border-t">
              {/* Left Column - Phase Names (Sticky) */}
              <div className="flex-shrink-0 w-48 md:w-56 border-r bg-background z-10">
                {/* Header */}
                <div className="h-12 border-b bg-muted/50 flex items-center px-3">
                  <span className="text-sm font-medium text-muted-foreground">Fase</span>
                </div>
                {/* Phase Rows */}
                {phases.map((phase) => (
                  <div
                    key={phase.id}
                    className="group h-14 border-b flex items-center justify-between px-3 hover:bg-muted/30 transition-colors"
                  >
                    <div 
                      className="truncate flex-1 cursor-pointer"
                      onClick={() => handlePhaseDetailsClick(phase)}
                    >
                      <p className="text-sm font-medium truncate">{phase.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{phase.workName}</p>
                    </div>
                    
                    {/* Action Menu - Visible on hover (desktop) or always (mobile) */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-background border shadow-lg z-50">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddPhase();
                          }}
                          className="cursor-pointer"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          ➕ Añadir Fase
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhase(phase);
                          }}
                          className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          🗑️ Eliminar Fase
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>

              {/* Right Side - Timeline (Scrollable) */}
              <ScrollArea className="flex-1" ref={scrollRef}>
                <div style={{ width: daysInMonth.length * 40 }}>
                  {/* Days Header */}
                  <div className="h-12 border-b bg-muted/50 flex">
                    {daysInMonth.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "w-10 flex-shrink-0 flex flex-col items-center justify-center border-r text-xs",
                          isToday(day) && "bg-primary/10"
                        )}
                      >
                        <span className={cn(
                          "font-medium",
                          isToday(day) ? "text-primary" : "text-muted-foreground"
                        )}>
                          {format(day, 'd')}
                        </span>
                        <span className={cn(
                          "text-[10px] uppercase",
                          isToday(day) ? "text-primary" : "text-muted-foreground/70"
                        )}>
                          {format(day, 'EEE', { locale: es }).substring(0, 2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Phase Bars */}
                  {phases.map((phase) => {
                    const barStyle = calculateBarStyle(phase);
                    const colors = getPhaseColor(phase);
                    
                    return (
                      <div
                        key={phase.id}
                        className="h-14 border-b relative flex items-center"
                      >
                        {/* Grid Lines */}
                        {daysInMonth.map((day) => (
                          <div
                            key={day.toISOString()}
                            className={cn(
                              "w-10 h-full flex-shrink-0 border-r",
                              isToday(day) && "bg-primary/5"
                            )}
                          />
                        ))}
                        
                        {/* Gantt Bar */}
                        {barStyle && (
                          <div
                            className={cn(
                              "absolute top-2 h-10 rounded-md border-2 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md flex items-center px-2",
                              colors.bg,
                              colors.border
                            )}
                            style={{
                              left: barStyle.left + 2,
                              width: barStyle.width,
                            }}
                            onClick={() => handlePhaseClick(phase)}
                          >
                            {barStyle.width > 60 && (
                              <span className={cn("text-xs font-medium truncate", colors.text)}>
                                {phase.progress}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/20 border-2 border-green-500" />
            <span className="text-muted-foreground">Completada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/20 border-2 border-blue-500" />
            <span className="text-muted-foreground">En curso</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500/20 border-2 border-red-500" />
            <span className="text-muted-foreground">Retrasada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-muted/50 border-2 border-muted-foreground/30" />
            <span className="text-muted-foreground">Pendiente</span>
          </div>
        </div>
      </div>

      {/* Phase Details Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] sm:h-[70vh] max-h-[90vh] flex flex-col p-0">
          {selectedPhase && (
            <>
              {/* Fixed Header */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <SheetTitle className="truncate">{selectedPhase.name}</SheetTitle>
                  {getStatusBadge(selectedPhase)}
                </div>
                <SheetDescription>
                  {selectedPhase.workName}
                </SheetDescription>
              </SheetHeader>
              
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Progress */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progreso</span>
                    <span className="font-medium">{selectedPhase.progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all",
                        selectedPhase.status === 'completed' ? 'bg-green-500' :
                        selectedPhase.status === 'in_progress' && isAfter(new Date(), selectedPhase.endDate) ? 'bg-red-500' :
                        'bg-blue-500'
                      )}
                      style={{ width: `${selectedPhase.progress}%` }}
                    />
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Fecha Inicio</p>
                    <p className="text-sm font-medium">
                      {format(selectedPhase.startDate, 'dd MMM yyyy', { locale: es })}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Fecha Fin</p>
                    <p className="text-sm font-medium">
                      {format(selectedPhase.endDate, 'dd MMM yyyy', { locale: es })}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-muted-foreground">Responsable</p>
                    <p className="text-sm font-medium">{selectedPhase.responsible}</p>
                  </div>
                </div>

                {/* Description */}
                {selectedPhase.description && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Descripción</p>
                    <p className="text-sm">{selectedPhase.description}</p>
                  </div>
                )}

                {/* Report Incident Form */}
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Reportar Incidencia
                  </p>
                  <Textarea
                    placeholder="Describe la incidencia o problema detectado..."
                    value={incidentDescription}
                    onChange={(e) => setIncidentDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              
              {/* Fixed Footer with Button */}
              <div className="flex-shrink-0 px-6 py-4 border-t bg-background">
                <Button 
                  onClick={handleReportIncident}
                  className="w-full"
                  variant="destructive"
                >
                  Enviar Reporte de Incidencia
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Phase Dialog */}
      <Dialog open={addPhaseDialogOpen} onOpenChange={setAddPhaseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Partida de Obra</DialogTitle>
            <DialogDescription>
              Introduce los datos de la nueva partida
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="new-phase-name">Nombre</Label>
              <Input
                id="new-phase-name"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                placeholder="Ej. Alicatado Baños"
                autoFocus
              />
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label>Fecha de Inicio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !newPhaseStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newPhaseStartDate ? (
                      format(newPhaseStartDate, "dd 'de' MMMM 'de' yyyy", { locale: es })
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={newPhaseStartDate}
                    onSelect={(date) => setNewPhaseStartDate(date)}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>Fecha de Fin</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !newPhaseEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newPhaseEndDate ? (
                      format(newPhaseEndDate, "dd 'de' MMMM 'de' yyyy", { locale: es })
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={newPhaseEndDate}
                    onSelect={(date) => setNewPhaseEndDate(date)}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setAddPhaseDialogOpen(false);
                setNewPhaseName('');
                setNewPhaseStartDate(undefined);
                setNewPhaseEndDate(undefined);
              }}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCreatePhase} 
              disabled={!newPhaseName.trim() || !newPhaseStartDate || !newPhaseEndDate || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Phase Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              ¿Eliminar Fase?
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro? Se borrará la fase <strong>"{phaseToDelete?.name}"</strong> y todas las fechas asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPhaseToDelete(null)} disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePhase}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                '🗑️ Eliminar Fase'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Phase Sheet (Right Side) */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          {selectedPhase && (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5" />
                  Editar Fase
                </SheetTitle>
                <SheetDescription>
                  Modifica los datos de la fase "{selectedPhase.name}"
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto py-6 space-y-6">
                {/* Phase Name */}
                <div className="space-y-2">
                  <Label htmlFor="edit-phase-name">Nombre de la Fase</Label>
                  <Input
                    id="edit-phase-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Cimentación"
                  />
                </div>

                {/* Start Date */}
                <div className="space-y-2">
                  <Label>Fecha de Inicio</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !editFormData.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editFormData.startDate ? (
                          format(editFormData.startDate, "dd 'de' MMMM 'de' yyyy", { locale: es })
                        ) : (
                          <span>Seleccionar fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={editFormData.startDate}
                        onSelect={(date) => setEditFormData(prev => ({ ...prev, startDate: date }))}
                        initialFocus
                        locale={es}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* End Date */}
                <div className="space-y-2">
                  <Label>Fecha de Fin</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !editFormData.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editFormData.endDate ? (
                          format(editFormData.endDate, "dd 'de' MMMM 'de' yyyy", { locale: es })
                        ) : (
                          <span>Seleccionar fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={editFormData.endDate}
                        onSelect={(date) => setEditFormData(prev => ({ ...prev, endDate: date }))}
                        initialFocus
                        locale={es}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Status Select */}
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value: 'pending' | 'in_progress' | 'completed') => 
                      setEditFormData(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Pendiente
                        </div>
                      </SelectItem>
                      <SelectItem value="in_progress">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-blue-500" />
                          En Curso
                        </div>
                      </SelectItem>
                      <SelectItem value="completed">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          Completada
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Current Phase Info */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Información actual</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Progreso:</span>
                      <span className="ml-2 font-medium">{selectedPhase.progress}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Obra:</span>
                      <span className="ml-2 font-medium">{selectedPhase.workName || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer with Save Button */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleSavePhaseChanges}
                  className="w-full"
                  disabled={isSaving || !editFormData.name.trim() || !editFormData.startDate || !editFormData.endDate}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Timeline;
