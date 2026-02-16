import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useUsers } from '@/hooks/useUsers';
import { useWorks } from '@/hooks/useWorks';
import { toast } from '@/hooks/use-toast';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, differenceInHours, differenceInMinutes, isPast, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Check, X, Edit2, Trash2, Clock, ChevronLeft, ChevronRight, CheckCircle2, Circle, PlayCircle, Bell, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type CalendarTask = Database['public']['Tables']['calendar_tasks']['Row'];
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface CalendarTasksProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CalendarTasks = ({ open, onOpenChange }: CalendarTasksProps) => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { users } = useUsers();
  const { works } = useWorks();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    task_date: format(new Date(), 'yyyy-MM-dd'),
    due_time: '',
    priority: 'medium' as TaskPriority,
    status: 'pending' as TaskStatus,
    assigned_to: '',
    work_id: '',
  });

  // Load tasks for the current month
  useEffect(() => {
    if (open && organization?.id) {
      loadTasks();
    }
  }, [open, organization?.id, currentMonth]);

  // Check for upcoming tasks and show notifications
  useEffect(() => {
    if (!open || !organization?.id || tasks.length === 0) return;

    const checkUpcomingTasks = () => {
      const now = new Date();
      
      tasks.forEach(task => {
        if (task.status === 'completed' || task.status === 'cancelled') return;

        const taskDateTime = task.due_time 
          ? parseISO(`${task.task_date}T${task.due_time}`)
          : parseISO(task.task_date);

        const hoursUntil = differenceInHours(taskDateTime, now);
        const minutesUntil = differenceInMinutes(taskDateTime, now);
        
        // Alert for tasks within 1 hour
        if (minutesUntil > 0 && minutesUntil <= 60 && task.priority === 'urgent') {
          playNotificationSound();
          toast({
            title: '⚠️ Tarea Urgente',
            description: `"${task.title}" vence en ${minutesUntil} minutos`,
            variant: 'destructive',
          });
        }
        // Alert for tasks within 24 hours
        else if (hoursUntil > 0 && hoursUntil <= 24 && (task.priority === 'high' || task.priority === 'urgent')) {
          toast({
            title: '🔔 Recordatorio de Tarea',
            description: `"${task.title}" vence en ${hoursUntil} horas`,
          });
        }
      });
    };

    // Check immediately and then every 15 minutes
    checkUpcomingTasks();
    const interval = setInterval(checkUpcomingTasks, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [open, organization?.id, tasks]);

  const playNotificationSound = useCallback(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  }, []);

  const loadTasks = async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from('calendar_tasks')
        .select('*')
        .eq('organization_id', organization.id)
        .gte('task_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('task_date', format(monthEnd, 'yyyy-MM-dd'))
        .order('task_date', { ascending: true })
        .order('due_time', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tareas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTask = async () => {
    if (!user || !organization?.id || !taskForm.title.trim()) {
      toast({
        title: 'Error',
        description: 'Por favor, completa el título de la tarea',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const taskData = {
        organization_id: organization.id,
        created_by: user.id,
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        task_date: taskForm.task_date,
        due_time: taskForm.due_time || null,
        priority: taskForm.priority,
        status: taskForm.status,
        assigned_to: taskForm.assigned_to || null,
        work_id: taskForm.work_id || null,
      };

      if (editingTask) {
        const { error } = await supabase
          .from('calendar_tasks')
          .update(taskData)
          .eq('id', editingTask.id);

        if (error) throw error;
        toast({ title: 'Tarea actualizada correctamente' });
      } else {
        const { error } = await supabase
          .from('calendar_tasks')
          .insert([taskData]);

        if (error) throw error;
      toast({ title: 'Tarea creada correctamente' });
      }

      setShowMobileSheet(false);
      setEditingTask(null);
      resetTaskForm();
      loadTasks();
    } catch (error) {
      console.error('Error saving task:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la tarea',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarea?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('calendar_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast({ title: 'Tarea eliminada correctamente' });
      loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarea',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (task: CalendarTask) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    
    setLoading(true);
    try {
      const updateData: any = {
        status: newStatus,
      };

      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = user?.id;
      } else {
        updateData.completed_at = null;
        updateData.completed_by = null;
      }

      const { error } = await supabase
        .from('calendar_tasks')
        .update(updateData)
        .eq('id', task.id);

      if (error) throw error;
      loadTasks();
    } catch (error) {
      console.error('Error updating task status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditTask = (task: CalendarTask) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      task_date: task.task_date,
      due_time: task.due_time || '',
      priority: task.priority as TaskPriority,
      status: task.status as TaskStatus,
      assigned_to: task.assigned_to || '',
      work_id: task.work_id || '',
    });
    setShowMobileSheet(true);
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      task_date: format(selectedDate, 'yyyy-MM-dd'),
      due_time: '',
      priority: 'medium',
      status: 'pending',
      assigned_to: '',
      work_id: '',
    });
    setEditingTask(null);
  };

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => 
      isSameDay(new Date(task.task_date), date) &&
      (filterStatus === 'all' || task.status === filterStatus)
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'in_progress': return <PlayCircle className="h-3 w-3 text-blue-500" />;
      case 'cancelled': return <X className="h-3 w-3 text-red-500" />;
      default: return <Circle className="h-3 w-3 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completada';
      case 'in_progress': return 'En progreso';
      case 'cancelled': return 'Cancelada';
      default: return 'Pendiente';
    }
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const selectedDateTasks = getTasksForDate(selectedDate);

  // Get urgent tasks for today
  const urgentTasksToday = tasks.filter(task => {
    if (task.status === 'completed' || task.status === 'cancelled') return false;
    const taskDate = parseISO(task.task_date);
    const isToday = isSameDay(taskDate, new Date());
    return isToday && (task.priority === 'urgent' || task.priority === 'high');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] sm:h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-3 sm:pb-4 border-b">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg sm:text-2xl">Calendario de Tareas</DialogTitle>
            {urgentTasksToday.length > 0 && (
              <Badge variant="destructive" className="gap-1 animate-pulse text-[10px] sm:text-xs">
                <Bell className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {urgentTasksToday.length} urgente{urgentTasksToday.length > 1 ? 's' : ''} hoy
              </Badge>
            )}
          </div>
          {urgentTasksToday.length > 0 && (
            <Alert className="mt-2 border-destructive text-xs sm:text-sm">
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
              <AlertDescription>
                Tienes {urgentTasksToday.length} tarea{urgentTasksToday.length > 1 ? 's' : ''} urgente{urgentTasksToday.length > 1 ? 's' : ''} para hoy
              </AlertDescription>
            </Alert>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="calendar" className="h-full flex flex-col">
            <TabsList className="mx-3 sm:mx-6 mt-2">
              <TabsTrigger value="calendar" className="text-xs sm:text-sm">Calendario</TabsTrigger>
              <TabsTrigger value="list" className="text-xs sm:text-sm">Lista de Tareas</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="flex-1 px-2 sm:px-6 pb-3 sm:pb-6 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_400px] gap-3 sm:gap-6 h-full">
                {/* Calendar */}
                <div className="flex flex-col min-h-0">
                  <div className="mb-2 sm:mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                    <div className="flex gap-1 sm:gap-2 items-center justify-between sm:justify-start">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10"
                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                      >
                        <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <h3 className="font-semibold text-sm sm:text-lg min-w-[140px] sm:min-w-[200px] text-center capitalize">
                        {format(currentMonth, 'MMM yyyy', { locale: es })}
                      </h3>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10"
                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                      >
                        <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs sm:text-sm h-8 sm:h-10"
                        onClick={() => setCurrentMonth(new Date())}
                      >
                        Hoy
                      </Button>
                    </div>
                    <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                      <SelectTrigger className="w-full sm:w-40 text-xs sm:text-sm h-8 sm:h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="pending">Pendientes</SelectItem>
                        <SelectItem value="in_progress">En progreso</SelectItem>
                        <SelectItem value="completed">Completadas</SelectItem>
                        <SelectItem value="cancelled">Canceladas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Modern Calendar Grid */}
                  <div className="flex-1 flex flex-col border rounded-lg overflow-hidden bg-background">
                    {/* Week Days Header */}
                    <div className="grid grid-cols-7 border-b bg-muted/50">
                      {weekDays.map(day => (
                        <div key={day} className="p-1 sm:p-2 text-center text-[10px] sm:text-sm font-semibold text-muted-foreground">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Days Grid */}
                    <div className="flex-1 grid grid-cols-7 overflow-auto" style={{ gridAutoRows: 'minmax(80px, 1fr)' }}>
                      {calendarDays.map(day => {
                        const dayTasks = getTasksForDate(day);
                        const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                        const isToday = isSameDay(day, new Date());
                        const isSelected = isSameDay(day, selectedDate);

                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => {
                              setSelectedDate(day);
                              setTaskForm({
                                title: '',
                                description: '',
                                task_date: format(day, 'yyyy-MM-dd'),
                                due_time: '',
                                priority: 'medium',
                                status: 'pending',
                                assigned_to: '',
                                work_id: '',
                              });
                              setEditingTask(null);
                              // Open mobile sheet on small screens
                              if (window.innerWidth < 1024) {
                                setShowMobileSheet(true);
                              }
                            }}
                            className={cn(
                              "border-r border-b p-1 sm:p-2 text-left hover:bg-accent/50 transition-colors flex flex-col gap-0.5 sm:gap-1",
                              !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                              isSelected && "bg-primary/10 ring-1 sm:ring-2 ring-primary ring-inset",
                              isToday && "font-bold"
                            )}
                          >
                            <div className={cn(
                              "text-base sm:text-2xl font-semibold leading-none",
                              isToday && "text-primary",
                              !isCurrentMonth && "text-muted-foreground/50"
                            )}>
                              {format(day, 'd')}
                            </div>
                            <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                              {dayTasks.slice(0, 2).map(task => (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "text-[9px] sm:text-xs px-0.5 sm:px-1.5 py-0.5 rounded truncate flex items-center gap-0.5 sm:gap-1",
                                    task.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' :
                                    task.priority === 'urgent' ? 'bg-red-100 dark:bg-red-900/30' :
                                    task.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/30' :
                                    'bg-blue-100 dark:bg-blue-900/30'
                                  )}
                                >
                                  <span className="truncate hidden sm:inline">{task.title}</span>
                                  <span className="w-1 h-1 rounded-full bg-current sm:hidden"></span>
                                </div>
                              ))}
                              {dayTasks.length > 2 && (
                                <div className="text-[8px] sm:text-xs text-muted-foreground">
                                  +{dayTasks.length - 2}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Tasks Panel - Visible on desktop, opens in sheet on mobile */}
                <div className="hidden lg:flex flex-col border rounded-lg bg-background min-h-0">
                  <div className="p-2 sm:p-4 border-b flex-shrink-0">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <h3 className="font-semibold text-sm sm:text-lg">
                        {format(selectedDate, "d 'de' MMMM", { locale: es })}
                      </h3>
                    </div>
                    
                    {/* Form always shown after clicking a date */}
                    <div className="space-y-2 p-2 sm:p-3 border rounded-lg bg-muted/50">
                      <Input
                        placeholder="Título de la tarea"
                        className="text-xs sm:text-sm h-8 sm:h-10"
                        value={taskForm.title}
                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      />
                      <Textarea
                        placeholder="Descripción (opcional)"
                        className="text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]"
                        value={taskForm.description}
                        onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                        rows={2}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="time"
                          placeholder="Hora"
                          className="text-xs sm:text-sm h-8 sm:h-10"
                          value={taskForm.due_time}
                          onChange={(e) => setTaskForm({ ...taskForm, due_time: e.target.value })}
                        />
                        <Select
                          value={taskForm.priority}
                          onValueChange={(value: TaskPriority) => setTaskForm({ ...taskForm, priority: value })}
                        >
                          <SelectTrigger className="text-xs sm:text-sm h-8 sm:h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Baja</SelectItem>
                            <SelectItem value="medium">Media</SelectItem>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="urgent">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Select
                        value={taskForm.status}
                        onValueChange={(value: TaskStatus) => setTaskForm({ ...taskForm, status: value })}
                      >
                        <SelectTrigger className="text-xs sm:text-sm h-8 sm:h-10">
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="in_progress">En progreso</SelectItem>
                          <SelectItem value="completed">Completada</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={taskForm.assigned_to || 'none'}
                        onValueChange={(value) => setTaskForm({ ...taskForm, assigned_to: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger className="text-xs sm:text-sm h-8 sm:h-10">
                          <SelectValue placeholder="Asignar a..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || 'Sin nombre'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={taskForm.work_id || 'none'}
                        onValueChange={(value) => setTaskForm({ ...taskForm, work_id: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger className="text-xs sm:text-sm h-8 sm:h-10">
                          <SelectValue placeholder="Relacionar con obra..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin obra</SelectItem>
                          {works.map(w => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name} ({w.number})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveTask} disabled={loading} size="sm" className="flex-1 h-8 text-xs sm:text-sm">
                          <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {editingTask ? 'Actualizar' : 'Crear'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            resetTaskForm();
                          }}
                          size="sm"
                          className="h-8"
                        >
                          <X className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-2 sm:p-4">
                    {loading ? (
                      <div className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
                        Cargando...
                      </div>
                    ) : selectedDateTasks.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
                        No hay tareas para este día
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedDateTasks.map(task => {
                          const assignedUser = users.find(u => u.id === task.assigned_to);
                          const relatedWork = works.find(w => w.id === task.work_id);
                          
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                "p-3 border rounded-lg space-y-2 transition-colors hover:bg-accent/50",
                                task.status === 'completed' && 'bg-muted/50 opacity-75'
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1">
                                  <button
                                    onClick={() => handleToggleStatus(task)}
                                    className="mt-0.5"
                                    disabled={loading}
                                  >
                                    {getStatusIcon(task.status)}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <h4 className={cn(
                                      "font-medium text-sm",
                                      task.status === 'completed' && 'line-through'
                                    )}>
                                      {task.title}
                                    </h4>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {task.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleEditTask(task)}
                                    disabled={loading}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleDeleteTask(task.id)}
                                    disabled={loading}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="flex flex-wrap gap-1.5 text-xs">
                                {task.due_time && (
                                  <Badge variant="outline" className="gap-1 text-xs py-0">
                                    <Clock className="h-2.5 w-2.5" />
                                    {task.due_time}
                                  </Badge>
                                )}
                                <Badge className={cn("text-xs py-0", getPriorityColor(task.priority))}>
                                  {task.priority === 'urgent' ? 'Urgente' : 
                                   task.priority === 'high' ? 'Alta' :
                                   task.priority === 'medium' ? 'Media' : 'Baja'}
                                </Badge>
                                {assignedUser && (
                                  <Badge variant="outline" className="text-xs py-0">
                                    {assignedUser.full_name}
                                  </Badge>
                                )}
                                {relatedWork && (
                                  <Badge variant="outline" className="text-xs py-0">
                                    {relatedWork.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="list" className="flex-1 px-2 sm:px-6 pb-3 sm:pb-6 overflow-hidden">
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  className="h-8 sm:h-10 text-xs sm:text-sm"
                  onClick={() => {
                    resetTaskForm();
                    setShowMobileSheet(true);
                  }}
                >
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Nueva Tarea
                </Button>
                <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="completed">Completadas</SelectItem>
                    <SelectItem value="cancelled">Canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[calc(100%-60px)]">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Cargando tareas...
                  </div>
                ) : tasks.filter(t => filterStatus === 'all' || t.status === filterStatus).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay tareas {filterStatus !== 'all' ? `(${getStatusLabel(filterStatus)})` : ''}
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {tasks
                      .filter(t => filterStatus === 'all' || t.status === filterStatus)
                      .map(task => {
                        const assignedUser = users.find(u => u.id === task.assigned_to);
                        const relatedWork = works.find(w => w.id === task.work_id);
                        
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors",
                              task.status === 'completed' && 'bg-muted/50 opacity-75'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-3 flex-1">
                                <button
                                  onClick={() => handleToggleStatus(task)}
                                  className="mt-0.5"
                                  disabled={loading}
                                >
                                  {getStatusIcon(task.status)}
                                </button>
                                <div className="flex-1">
                                  <h4 className={cn(
                                    "font-medium",
                                    task.status === 'completed' && 'line-through'
                                  )}>
                                    {task.title}
                                  </h4>
                                  {task.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {task.description}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                                    <Badge variant="outline">
                                      {format(new Date(task.task_date), "d 'de' MMMM, yyyy", { locale: es })}
                                    </Badge>
                                    {task.due_time && (
                                      <Badge variant="outline" className="gap-1">
                                        <Clock className="h-3 w-3" />
                                        {task.due_time}
                                      </Badge>
                                    )}
                                    <Badge className={getPriorityColor(task.priority)}>
                                      {task.priority === 'urgent' ? 'Urgente' : 
                                       task.priority === 'high' ? 'Alta' :
                                       task.priority === 'medium' ? 'Media' : 'Baja'}
                                    </Badge>
                                    <Badge variant="secondary">
                                      {getStatusLabel(task.status)}
                                    </Badge>
                                    {assignedUser && (
                                      <Badge variant="outline">
                                        {assignedUser.full_name}
                                      </Badge>
                                    )}
                                    {relatedWork && (
                                      <Badge variant="outline">
                                        {relatedWork.name}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditTask(task)}
                                  disabled={loading}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteTask(task.id)}
                                  disabled={loading}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>

      {/* Mobile Sheet for Task Creation */}
      <Sheet open={showMobileSheet} onOpenChange={setShowMobileSheet}>
        <SheetContent side="bottom" className="h-[90vh]">
          <SheetHeader>
            <SheetTitle>{format(selectedDate, "d 'de' MMMM", { locale: es })}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100%-80px)] mt-4">
            <div className="space-y-3 px-1">
              <Input
                placeholder="Título de la tarea"
                className="text-sm"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              />
              <Textarea
                placeholder="Descripción (opcional)"
                className="text-sm min-h-[80px]"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                rows={3}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="time"
                  placeholder="Hora"
                  className="text-sm"
                  value={taskForm.due_time}
                  onChange={(e) => setTaskForm({ ...taskForm, due_time: e.target.value })}
                />
                <Select
                  value={taskForm.priority}
                  onValueChange={(value: TaskPriority) => setTaskForm({ ...taskForm, priority: value })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select
                value={taskForm.status}
                onValueChange={(value: TaskStatus) => setTaskForm({ ...taskForm, status: value })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={taskForm.assigned_to || 'none'}
                onValueChange={(value) => setTaskForm({ ...taskForm, assigned_to: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Asignar a..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || 'Sin nombre'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={taskForm.work_id || 'none'}
                onValueChange={(value) => setTaskForm({ ...taskForm, work_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Relacionar con obra..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin obra</SelectItem>
                  {works.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Tasks list for selected date */}
              <div className="pt-4 border-t">
                <h3 className="font-semibold mb-2">Tareas del día</h3>
                {selectedDateTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay tareas</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDateTasks.map(task => (
                      <div key={task.id} className="p-2 border rounded text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{task.title}</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleEditTask(task)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
          
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background flex gap-2">
            <Button onClick={handleSaveTask} disabled={loading} className="flex-1">
              <Check className="h-4 w-4 mr-2" />
              {editingTask ? 'Actualizar' : 'Crear Tarea'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowMobileSheet(false);
                resetTaskForm();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Dialog>
  );
};