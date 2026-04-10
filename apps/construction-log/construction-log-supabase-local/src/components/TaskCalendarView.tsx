import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CalendarDays,
  CheckCircle2,
  CircleDotDashed,
  Loader2,
  Plus,
  Trash2,
  User2,
} from 'lucide-react';

import type { ApiUser } from '@/integrations/api/modules/users';
import {
  createErpTask,
  deleteErpTask,
  listErpTasks,
  updateErpTask,
  type ApiErpTask,
  type ApiErpTaskStatus,
} from '@/integrations/api/client';
import { useWorkReportExportCalendar } from '@/hooks/useWorkReportExportCalendar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type TaskCalendarViewProps = {
  tenantId?: number | string | null;
  currentUser?: ApiUser | null;
  canManageTasks: boolean;
};

type NormalizedTaskStatus = 'pending' | 'in_progress' | 'done';

const STATUS_OPTIONS: Array<{ value: NormalizedTaskStatus; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'done', label: 'Completada' },
];

const STATUS_BADGE_CLASSNAME: Record<NormalizedTaskStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 border-amber-200',
  in_progress: 'bg-sky-100 text-sky-900 border-sky-200',
  done: 'bg-emerald-100 text-emerald-900 border-emerald-200',
};

function parseTaskDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

function normalizeTaskStatus(task: ApiErpTask): NormalizedTaskStatus {
  const raw = String(task.status ?? '').trim().toLowerCase();
  if (raw === 'pending' || raw === 'in_progress' || raw === 'done') {
    return raw;
  }
  return task.is_completed ? 'done' : 'pending';
}

function taskOccursOnDate(task: ApiErpTask, targetDate: Date): boolean {
  const start = parseTaskDate(task.start_date);
  const end = parseTaskDate(task.end_date);
  const day = startOfDay(targetDate);

  if (start && end) {
    return isWithinInterval(day, {
      start: startOfDay(start),
      end: startOfDay(end),
    });
  }

  if (start) return isSameDay(start, day);
  if (end) return isSameDay(end, day);
  return false;
}

function buildLocalTaskDate(date: Date, hour: number, minute = 0): string {
  return format(setMinutes(setHours(startOfDay(date), hour), minute), "yyyy-MM-dd'T'HH:mm:ss");
}

function formatTaskSchedule(task: ApiErpTask): string {
  const start = parseTaskDate(task.start_date);
  const end = parseTaskDate(task.end_date);

  if (start && end) {
    const sameDay = isSameDay(start, end);
    if (sameDay) {
      return `${format(start, 'dd/MM/yyyy', { locale: es })} · ${format(start, 'HH:mm')} - ${format(
        end,
        'HH:mm',
      )}`;
    }
    return `${format(start, 'dd/MM/yyyy HH:mm', { locale: es })} -> ${format(end, 'dd/MM/yyyy HH:mm', {
      locale: es,
    })}`;
  }

  if (start) return format(start, 'dd/MM/yyyy HH:mm', { locale: es });
  if (end) return format(end, 'dd/MM/yyyy HH:mm', { locale: es });
  return 'Sin fecha';
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export const TaskCalendarView = ({
  tenantId,
  currentUser,
  canManageTasks,
}: TaskCalendarViewProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStatus, setDraftStatus] = useState<NormalizedTaskStatus>('pending');

  const { calendarStartMonth, calendarEndMonth, calendarClassNames } = useWorkReportExportCalendar();

  const effectiveTenantId = tenantId ?? currentUser?.tenant_id ?? null;
  const requiresTenantSelection = Boolean(currentUser?.is_super_admin) && effectiveTenantId == null;
  const canLoadTenantData = !requiresTenantSelection;
  const tasksQueryKey = ['task-calendar-tasks', effectiveTenantId ?? 'self'];

  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: tasksQueryKey,
    queryFn: () => listErpTasks(effectiveTenantId == null ? undefined : effectiveTenantId),
    enabled: canLoadTenantData,
  });

  useEffect(() => {
    setSelectedDate(new Date());
    setDraftStatus('pending');
    setDraftTitle('');
    setDraftDescription('');
  }, []);

  useEffect(() => {
    if (createTaskOpen) return;
    setDraftTitle('');
    setDraftDescription('');
    setDraftStatus('pending');
  }, [createTaskOpen]);

  const currentUserLabel = useMemo(() => {
    if (currentUser?.full_name) return currentUser.full_name;
    if (currentUser?.email) return currentUser.email;
    if (currentUser?.id != null) return `Usuario #${currentUser.id}`;
    return 'Tu usuario';
  }, [currentUser?.email, currentUser?.full_name, currentUser?.id]);

  const visibleTasks = useMemo(() => {
    if (currentUser?.id == null) return [];
    return tasks.filter((task) => task.assigned_to_id === currentUser.id);
  }, [currentUser?.id, tasks]);

  const tasksForSelectedDate = useMemo(() => {
    return [...visibleTasks]
      .filter((task) => taskOccursOnDate(task, selectedDate))
      .sort((a, b) => {
        const statusOrder: Record<NormalizedTaskStatus, number> = {
          pending: 0,
          in_progress: 1,
          done: 2,
        };
        const byStatus = statusOrder[normalizeTaskStatus(a)] - statusOrder[normalizeTaskStatus(b)];
        if (byStatus !== 0) return byStatus;
        const aStart = parseTaskDate(a.start_date)?.getTime() ?? 0;
        const bStart = parseTaskDate(b.start_date)?.getTime() ?? 0;
        return aStart - bStart;
      });
  }, [selectedDate, visibleTasks]);

  const daysWithTasks = useMemo(() => {
    return Array.from(
      new Set(
        visibleTasks
          .flatMap((task) => {
            const start = parseTaskDate(task.start_date);
            const end = parseTaskDate(task.end_date);
            if (start && end) {
              const result: Date[] = [];
              let cursor = startOfDay(start);
              const last = startOfDay(end);
              while (cursor.getTime() <= last.getTime()) {
                result.push(cursor);
                cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
              }
              return result;
            }
            if (start) return [startOfDay(start)];
            if (end) return [startOfDay(end)];
            return [];
          })
          .map((date) => date.getTime()),
      ),
    ).map((time) => new Date(time));
  }, [visibleTasks]);

  const pendingCount = useMemo(
    () => visibleTasks.filter((task) => normalizeTaskStatus(task) === 'pending').length,
    [visibleTasks],
  );
  const inProgressCount = useMemo(
    () => visibleTasks.filter((task) => normalizeTaskStatus(task) === 'in_progress').length,
    [visibleTasks],
  );
  const completedCount = useMemo(
    () => visibleTasks.filter((task) => normalizeTaskStatus(task) === 'done').length,
    [visibleTasks],
  );

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = draftTitle.trim();
      if (!trimmedTitle) {
        throw new Error('Escribe un titulo para la tarea.');
      }

      if (currentUser?.id == null) {
        throw new Error('No se ha podido identificar al usuario actual.');
      }

      return createErpTask(
        {
          title: trimmedTitle,
          description: draftDescription.trim() || null,
          assigned_to_id: Number(currentUser.id),
          status: draftStatus,
          start_date: buildLocalTaskDate(selectedDate, 8, 0),
          end_date: buildLocalTaskDate(selectedDate, 18, 0),
          is_completed: draftStatus === 'done',
        },
        effectiveTenantId == null ? undefined : effectiveTenantId,
      );
    },
    onSuccess: async () => {
      setDraftTitle('');
      setDraftDescription('');
      setDraftStatus('pending');
      setCreateTaskOpen(false);
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      toast({
        title: 'Tarea creada',
        description: 'La tarea ya aparece en el calendario.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo crear la tarea',
        description: toErrorMessage(error, 'Revisa los datos e intentalo de nuevo.'),
        variant: 'destructive',
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (params: {
      taskId: number;
      payload: {
        status?: ApiErpTaskStatus;
      };
    }) => {
      return updateErpTask(
        params.taskId,
        params.payload,
        effectiveTenantId == null ? undefined : effectiveTenantId,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo actualizar la tarea',
        description: toErrorMessage(error, 'Intentalo de nuevo.'),
        variant: 'destructive',
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) =>
      deleteErpTask(taskId, effectiveTenantId == null ? undefined : effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      toast({
        title: 'Tarea eliminada',
        description: 'La tarea se ha quitado del calendario.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo eliminar la tarea',
        description: toErrorMessage(error, 'Intentalo de nuevo.'),
        variant: 'destructive',
      });
    },
  });

  const selectedDateLabel = useMemo(
    () => format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es }),
    [selectedDate],
  );

  if (requiresTenantSelection) {
    return (
      <div className="rounded-3xl border bg-white px-6 py-8 text-sm text-muted-foreground shadow-sm">
        Selecciona primero un tenant activo para cargar las tareas del calendario.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-slate-900">Calendario de tareas</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta y gestiona solo las tareas vinculadas a tu usuario identificado en la aplicacion.
        </p>
      </div>

      <div className="grid min-h-[75vh] gap-0 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="border-r bg-slate-50/80 px-4 py-4">
          <div className="grid grid-cols-3 gap-2 pb-4">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-muted-foreground">Pendientes</div>
              <div className="text-xl font-semibold text-amber-700">{pendingCount}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-muted-foreground">En progreso</div>
              <div className="text-xl font-semibold text-sky-700">{inProgressCount}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-muted-foreground">Completadas</div>
              <div className="text-xl font-semibold text-emerald-700">{completedCount}</div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) setSelectedDate(date);
              }}
              locale={es}
              startMonth={calendarStartMonth}
              endMonth={calendarEndMonth}
              classNames={calendarClassNames}
              modifiers={{
                hasTasks: daysWithTasks,
              }}
              modifiersClassNames={{
                hasTasks:
                  'bg-sky-100 text-sky-900 font-semibold ring-1 ring-sky-200 rounded-md',
              }}
            />
          </div>

          <div className="mt-4 rounded-xl border bg-white p-3 text-sm text-muted-foreground">
            {tasksLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando tareas...
              </div>
            ) : tasksError ? (
              <span className="text-destructive">
                {toErrorMessage(tasksError, 'No se pudieron cargar las tareas.')}
              </span>
            ) : (
              <>
                <div className="font-medium text-foreground">Dia seleccionado</div>
                <div className="capitalize">{selectedDateLabel}</div>
                <div className="mt-1 text-xs">Usuario: {currentUserLabel}</div>
                <div className="mt-2">
                  {tasksForSelectedDate.length} tarea{tasksForSelectedDate.length === 1 ? '' : 's'} en este dia
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col px-4 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Agenda del dia</div>
              <h3 className="text-xl font-semibold capitalize">{selectedDateLabel}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                {tasksForSelectedDate.length} elemento{tasksForSelectedDate.length === 1 ? '' : 's'}
              </Badge>
              {canManageTasks ? (
                <Button
                  onClick={() => setCreateTaskOpen(true)}
                  className="rounded-xl"
                  disabled={currentUser?.id == null}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear tarea
                </Button>
              ) : null}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 rounded-2xl border bg-white">
            <div className="space-y-3 p-4">
              {tasksLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando tareas del dia...
                </div>
              ) : tasksForSelectedDate.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No hay tareas para este dia.
                </div>
              ) : (
                tasksForSelectedDate.map((task) => {
                  const normalizedStatus = normalizeTaskStatus(task);
                  const isUpdatingTask =
                    updateTaskMutation.isPending && updateTaskMutation.variables?.taskId === task.id;
                  const isDeletingTask =
                    deleteTaskMutation.isPending && deleteTaskMutation.variables === task.id;

                  return (
                    <div
                      key={task.id}
                      className="rounded-2xl border p-4 shadow-sm transition-colors hover:bg-slate-50/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold text-slate-900">{task.title}</h4>
                            <Badge
                              variant="outline"
                              className={cn('border', STATUS_BADGE_CLASSNAME[normalizedStatus])}
                            >
                              {STATUS_OPTIONS.find((option) => option.value === normalizedStatus)?.label}
                            </Badge>
                          </div>

                          {task.description ? (
                            <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatTaskSchedule(task)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <User2 className="h-3.5 w-3.5" />
                              {currentUserLabel}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {normalizedStatus === 'done' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <CircleDotDashed className="h-5 w-5 text-amber-600" />
                          )}
                        </div>
                      </div>

                      {canManageTasks ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                          <Select
                            value={normalizedStatus}
                            onValueChange={(value) => {
                              void updateTaskMutation.mutateAsync({
                                taskId: task.id,
                                payload: { status: value as NormalizedTaskStatus },
                              });
                            }}
                            disabled={isUpdatingTask || isDeletingTask}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            onClick={() => void deleteTaskMutation.mutateAsync(task.id)}
                            disabled={isUpdatingTask || isDeletingTask}
                          >
                            {isDeletingTask ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
            <DialogDescription>
              La tarea se guardara para {currentUserLabel} en el dia {format(selectedDate, 'dd/MM/yyyy')}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="task-calendar-title">Titulo</Label>
              <Input
                id="task-calendar-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Ej: Revisar parte de obra, visitar cliente, validar mediciones..."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="task-calendar-description">Descripcion</Label>
              <Textarea
                id="task-calendar-description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="Detalles o contexto de la tarea"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Estado inicial</Label>
              <Select
                value={draftStatus}
                onValueChange={(value) => setDraftStatus(value as NormalizedTaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateTaskOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void createTaskMutation.mutateAsync()}
              disabled={createTaskMutation.isPending || currentUser?.id == null}
            >
              {createTaskMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Crear tarea
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};
