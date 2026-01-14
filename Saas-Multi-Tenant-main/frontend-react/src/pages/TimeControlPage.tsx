import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  IconButton,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Text,
  VStack,
  useDisclosure,
  useToast,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { FaPlay, FaStop } from "react-icons/fa";

import {
  ErpTask,
  fetchErpTasks,
  getActiveTimeSession,
  startTimeSession,
  stopTimeSession,
  TimeSession,
} from "../api/erpTimeTracking";
import {
  createTimeSession,
  deleteTimeSession,
  fetchTimeSessions,
  TimeSessionBlock,
  updateTimeSession,
} from "../api/erpSessions";
import { updateErpTask } from "../api/erpManagement";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";

// Horas visibles en el calendario (0-23).
const HOURS = Array.from({ length: 24 }, (_, idx) => idx);
// Altura de cada bloque de hora en el calendario (px).
const HOUR_HEIGHT = 48;
// Duracion minima por sesion de tiempo (min).
const MIN_SESSION_MINUTES = 30;
// Opciones de granularidad para ajustar/arrastrar sesiones (min).
const MINUTES_STEP_OPTIONS = [15, 30, 60];

// Convierte segundos a formato HH:mm:ss.
const formatSeconds = (total: number): string => {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((v) => v.toString().padStart(2, "0"))
    .join(":");
};

// Calcula el inicio de semana (lunes) para una fecha dada.
const startOfWeek = (date: Date): Date => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

// Suma dias a una fecha sin mutar el original.
const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const WEEKDAY_LABELS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

// Formatea el encabezado corto de dia (lun 12).
const formatDayLabel = (date: Date): string => {
  const day = WEEKDAY_LABELS[date.getDay()] ?? "";
  return `${day} ${date.getDate()}`;
};

// Formatea fecha para inputs datetime-local.
const formatDateInput = (date: Date): string => date.toISOString().slice(0, 16);

// Limita un valor entre min y max.
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// Redondea minutos al paso configurado.
const roundToStep = (minutes: number, step: number): number =>
  Math.round(minutes / step) * step;

// Formatea minutos a HH:mm para ayudas visuales de arrastre.
const formatMinutesLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
};

// Pantalla principal de control de tiempo con calendario interactivo.
export const TimeControlPage: React.FC = () => {
  // Utilidades globales (toasts y modal).
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const calendarRef = useRef<HTMLDivElement | null>(null);

  // Estado de tracking actual y tareas disponibles.
  const [activeSession, setActiveSession] = useState<TimeSession | null>(null);
  const [taskIdInput, setTaskIdInput] = useState<string>("");
  const [tasks, setTasks] = useState<ErpTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [isDraggingSession, setIsDraggingSession] = useState(false);
  const [recentTaskIds, setRecentTaskIds] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("recent_task_ids");
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  });

  // Vista activa del modulo de tiempo.
  const [viewMode, setViewMode] = useState<"calendar" | "list" | "timesheet">(
    "calendar"
  );
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date())
  );
  const [sessions, setSessions] = useState<TimeSessionBlock[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [minutesStep, setMinutesStep] = useState<number>(15);

  // Estado del formulario modal para crear/editar sesiones.
  const [draftTaskId, setDraftTaskId] = useState<string>("");
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [draftDescription, setDraftDescription] = useState<string>("");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [selection, setSelection] = useState<{
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    mode: "select" | "move" | "resize";
    sessionId?: number;
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
    offsetMinutes?: number;
  } | null>(null);

  // Tokens de color para UI.
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const mutedText = useColorModeValue("gray.400", "gray.500");
  const accent = useColorModeValue("brand.500", "brand.300");
  const calendarHeaderBg = useColorModeValue("green.600", "green.700");
  const calendarHeaderText = useColorModeValue("white", "white");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();

  // Flags y derivados del estado actual.
  const isRunning = Boolean(activeSession && activeSession.is_active);
  const currentUserId = currentUser?.id ?? null;
  // Dias visibles en la semana actual.
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart]
  );

  // Convierte coordenadas Y en minutos dentro del calendario.
  const getMinutesFromClientY = (clientY: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const y = clamp(clientY - rect.top, 0, rect.height);
    const minutes = (y / HOUR_HEIGHT) * 60;
    return clamp(roundToStep(minutes, minutesStep), 0, 24 * 60);
  };

  // Convierte coordenadas X en indice de dia de la semana.
  const getDayIndexFromClientX = (clientX: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const columnWidth = rect.width / 8;
    const x = clamp(clientX - rect.left, 0, rect.width - 1);
    return clamp(Math.floor(x / columnWidth) - 1, 0, 6);
  };

  // Convierte un indice de dia y minutos en una fecha absoluta.
  const minutesToDate = (dayIndex: number, minutes: number): Date => {
    const base = new Date(weekDays[dayIndex]);
    base.setHours(0, 0, 0, 0);
    base.setMinutes(minutes);
    return base;
  };

  // Mapa rapido de tareas por id para renderizado.
  const taskById = useMemo(() => {
    const map = new Map<number, ErpTask>();
    tasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [tasks]);

  // Rango de fechas para cargar sesiones de la semana.
  const weekRange = useMemo(() => {
    const start = new Date(weekStart);
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [weekStart]);

  // Total de segundos acumulados en la semana.
  const totalWeekSeconds = useMemo(() => {
    return sessions.reduce((acc, session) => acc + session.duration_seconds, 0);
  }, [sessions]);

  // Formato legible del tiempo activo.
  const formattedElapsed = useMemo(
    () => formatSeconds(elapsedSeconds),
    [elapsedSeconds]
  );
  // Ultimas tareas recientes para acceso rapido.
  const recentTasks = useMemo(() => {
    const scopedTasks = currentUserId
      ? tasks.filter((task) => task.assigned_to_id === currentUserId)
      : tasks;
    const taskById = new Map(scopedTasks.map((task) => [task.id, task]));
    const fromHistory = recentTaskIds
      .map((id) => taskById.get(id))
      .filter((task): task is ErpTask => Boolean(task))
      .slice(0, 3);
    if (fromHistory.length > 0) return fromHistory;
    return [...scopedTasks]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 3);
  }, [tasks, currentUserId, recentTaskIds]);

  // Carga la sesion activa al iniciar la pantalla.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getActiveTimeSession();
      if (!cancelled) {
        setActiveSession(session);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga tareas del ERP para selects y tablero.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchErpTasks();
        if (!cancelled) {
          setTasks(list);
          setTasksError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setTasksError(
            error?.response?.data?.detail ??
              "No se han podido cargar las tareas del ERP."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mantiene el contador de tiempo activo sincronizado.
  useEffect(() => {
    if (!activeSession || !activeSession.is_active) {
      setElapsedSeconds(0);
      return;
    }

    const started = new Date(activeSession.started_at).getTime();

    const update = () => {
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((now - started) / 1000));
      setElapsedSeconds(diffSeconds);
    };

    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeSession]);

  // Actualiza el reloj de "ahora" para la linea temporal.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Refresca la tarea seleccionada cuando hay sesion activa.
  useEffect(() => {
    if (activeSession?.task_id) {
      setTaskIdInput(String(activeSession.task_id));
    }
  }, [activeSession]);

  // Carga sesiones de tiempo para la semana visible.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingSessions(true);
      try {
        const list = await fetchTimeSessions(
          weekRange.start.toISOString(),
          weekRange.end.toISOString()
        );
        if (!cancelled) {
          setSessions(list);
          setSessionsError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setSessionsError(
            error?.response?.data?.detail ??
              "No se han podido cargar las sesiones."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekRange.start, weekRange.end]);

  // Gestiona el arrastre y resize de sesiones en el calendario.
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (event: MouseEvent) => {
      if (!calendarRef.current) return;
      const minutes = getMinutesFromClientY(event.clientY);
      const dayIndex = getDayIndexFromClientX(event.clientX);

      if (dragState.mode === "select") {
        setSelection({
          dayIndex: dragState.dayIndex,
          startMinutes: dragState.startMinutes,
          endMinutes: minutes,
        });
        return;
      }

      if (dragState.mode === "move") {
        const duration = dragState.endMinutes - dragState.startMinutes;
        const newStart = clamp(
          minutes - (dragState.offsetMinutes ?? 0),
          0,
          24 * 60 - duration
        );
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                dayIndex,
                startMinutes: newStart,
                endMinutes: newStart + duration,
              }
            : prev
        );
        return;
      }

      if (dragState.mode === "resize") {
        const newEnd = Math.max(
          minutes,
          dragState.startMinutes + MIN_SESSION_MINUTES
        );
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                endMinutes: clamp(newEnd, 0, 24 * 60),
              }
            : prev
        );
      }
    };

    const handleUp = async () => {
      if (dragState.mode === "select" && selection) {
        const start = Math.min(selection.startMinutes, selection.endMinutes);
        const end = Math.max(selection.startMinutes, selection.endMinutes);
        const normalizedEnd =
          end - start < MIN_SESSION_MINUTES ? start + MIN_SESSION_MINUTES : end;
        const startDate = minutesToDate(selection.dayIndex, start);
        const endDate = minutesToDate(selection.dayIndex, normalizedEnd);
        setDraftStart(formatDateInput(startDate));
        setDraftEnd(formatDateInput(endDate));
        setDraftTaskId(taskIdInput || "");
        setDraftDescription("");
        setEditingSessionId(null);
        onOpen();
        setSelection(null);
      }

      if (
        (dragState.mode === "move" || dragState.mode === "resize") &&
        dragState.sessionId
      ) {
        setIsDraggingSession(false);
        const startDate = minutesToDate(
          dragState.dayIndex,
          dragState.startMinutes
        );
        const endDate = minutesToDate(dragState.dayIndex, dragState.endMinutes);
        setSessions((prev) =>
          prev.map((session) =>
            session.id === dragState.sessionId
              ? {
                  ...session,
                  started_at: startDate.toISOString(),
                  ended_at: endDate.toISOString(),
                  duration_seconds: Math.max(
                    0,
                    Math.floor((endDate.getTime() - startDate.getTime()) / 1000)
                  ),
                }
              : session
          )
        );
        try {
          await updateTimeSession(dragState.sessionId, {
            started_at: startDate.toISOString(),
            ended_at: endDate.toISOString(),
          });
        } catch (error: any) {
          toast({
            title: "No se pudo actualizar la sesion",
            description: error?.response?.data?.detail ?? "Revisa los datos.",
            status: "error",
          });
        }
      }

      setIsDraggingSession(false);
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });

    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, [dragState, selection, onOpen, taskIdInput, toast, weekDays]);

  // Guarda un historico corto de tareas seleccionadas por el usuario.
  const updateRecentTaskIds = (taskId: number) => {
    setRecentTaskIds((prev) => {
      const next = [taskId, ...prev.filter((id) => id !== taskId)].slice(0, 10);
      localStorage.setItem("recent_task_ids", JSON.stringify(next));
      return next;
    });
  };

  // Seleccion de tarea desde el desplegable.
  // Sincroniza selector y lista de ultimas tareas.
  const handleTaskSelectionChange = (value: string) => {
    setTaskIdInput(value);
    const id = Number(value);
    if (!Number.isNaN(id) && id > 0) {
      updateRecentTaskIds(id);
    }
  };

  // Inicia tracking manual desde el selector de tarea.
  const handleStart = async () => {
    const taskId = Number(taskIdInput);
    if (!taskId || Number.isNaN(taskId)) {
      toast({
        title: "Tarea no valida",
        description: "Selecciona una tarea del ERP.",
        status: "warning",
      });
      return;
    }

    try {
      setIsLoading(true);
      const session = await startTimeSession(taskId);
      updateRecentTaskIds(taskId);
      await updateErpTask(taskId, { status: "in_progress" });
      setActiveSession(session);
      setTaskIdInput(String(taskId));
      setWeekStart(startOfWeek(new Date()));
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, status: "in_progress" } : task
        )
      );
      toast({
        title: "Tracking iniciado",
        description: `Sesion de tiempo iniciada para la tarea ${taskId}.`,
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error al iniciar tracking",
        description:
          error?.response?.data?.detail ??
          "No se ha podido iniciar la sesion de tiempo.",
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Inicia tracking rapido desde accesos directos.
  const handleQuickStart = async (taskId: number) => {
    if (isRunning) {
      toast({
        title: "Ya hay una sesion activa",
        description: "Deten la sesion actual antes de iniciar otra.",
        status: "warning",
      });
      return;
    }
    try {
      setIsLoading(true);
      const session = await startTimeSession(taskId);
      updateRecentTaskIds(taskId);
      await updateErpTask(taskId, { status: "in_progress" });
      setActiveSession(session);
      setTaskIdInput(String(taskId));
      setWeekStart(startOfWeek(new Date()));
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, status: "in_progress" } : task
        )
      );
      toast({
        title: "Tracking iniciado",
        description: `Sesion de tiempo iniciada para la tarea ${taskId}.`,
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error al iniciar tracking",
        description:
          error?.response?.data?.detail ??
          "No se ha podido iniciar la sesion de tiempo.",
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Detiene la sesion activa de tracking.
  const handleStop = async () => {
    try {
      setIsLoading(true);
      const session = await stopTimeSession();
      setActiveSession(session);
      toast({
        title: "Tracking detenido",
        description: `Sesion finalizada. Duracion: ${formattedElapsed}.`,
        status: "info",
      });
    } catch (error: any) {
      toast({
        title: "Error al detener tracking",
        description:
          error?.response?.data?.detail ??
          "No se ha podido detener la sesion de tiempo activa.",
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Inicia la seleccion para crear una nueva sesion en el calendario.
  const startSelection = (dayIndex: number, minutes: number) => {
    const normalized = clamp(roundToStep(minutes, minutesStep), 0, 24 * 60);
    setSelection({
      dayIndex,
      startMinutes: normalized,
      endMinutes: normalized,
    });
    setDragState({
      mode: "select",
      dayIndex,
      startMinutes: normalized,
      endMinutes: normalized,
    });
  };

  // Guarda una sesion nueva o edita una existente.
  const handleSaveSession = async () => {
    const taskId = Number(draftTaskId);
    if (!taskId || Number.isNaN(taskId)) {
      toast({ title: "Selecciona una tarea", status: "warning" });
      return;
    }
    if (!draftStart || !draftEnd) {
      toast({ title: "Selecciona el rango horario", status: "warning" });
      return;
    }
    try {
      const payload = {
        task_id: taskId,
        description: draftDescription || null,
        started_at: new Date(draftStart).toISOString(),
        ended_at: new Date(draftEnd).toISOString(),
      };

      if (editingSessionId) {
        const updated = await updateTimeSession(editingSessionId, payload);
        setSessions((prev) =>
          prev.map((session) =>
            session.id === editingSessionId ? updated : session
          )
        );
        toast({ title: "Sesion actualizada", status: "success" });
      } else {
        const created = await createTimeSession(payload);
        setSessions((prev) => [created, ...prev]);
        toast({ title: "Sesion creada", status: "success" });
      }

      handleCloseModal();
    } catch (error: any) {
      toast({
        title: editingSessionId
          ? "Error al actualizar sesion"
          : "Error al crear sesion",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    }
  };

  // Limpia estado del modal de sesion.
  const handleCloseModal = () => {
    setEditingSessionId(null);
    setDraftDescription("");
    onClose();
  };

  // Elimina una sesion desde el modal.
  const handleDeleteSession = async () => {
    if (!editingSessionId) return;
    try {
      await deleteTimeSession(editingSessionId);
      setSessions((prev) =>
        prev.filter((session) => session.id !== editingSessionId)
      );
      toast({ title: "Sesion eliminada", status: "success" });
      handleCloseModal();
    } catch (error: any) {
      toast({
        title: "Error al eliminar sesion",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    }
  };

  // Abre el modal con los datos de una sesion existente.
  const openEditSession = (session: TimeSessionBlock) => {
    const start = new Date(session.started_at);
    const end = session.ended_at
      ? new Date(session.ended_at)
      : new Date(start.getTime() + MIN_SESSION_MINUTES * 60000);
    setEditingSessionId(session.id);
    setDraftTaskId(String(session.task_id));
    setDraftStart(formatDateInput(start));
    setDraftEnd(formatDateInput(end));
    setDraftDescription(session.description ?? "");
    setSelection(null);
    onOpen();
  };

  // Elimina rapidamente una sesion desde la vista calendario.
  const handleQuickDelete = async (sessionId: number) => {
    try {
      await deleteTimeSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      toast({ title: "Sesion eliminada", status: "success" });
    } catch (error: any) {
      toast({
        title: "Error al eliminar sesion",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    }
  };

  // Arrastre de tareas recientes para crear una sesion en el calendario.
  // Arrastre desde accesos rapidos hacia el calendario.
  const handleTaskDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: number
  ) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", String(taskId));
    setDragTaskId(taskId);
  };

  // Drop de una tarea sobre el calendario para crear sesion.
  // Crea sesion al soltar una tarea sobre el calendario.
  const handleCalendarDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rawId = event.dataTransfer.getData("text/plain");
    const taskId = Number(rawId);
    if (!taskId) return;

    const minutes = getMinutesFromClientY(event.clientY);
    const dayIndex = getDayIndexFromClientX(event.clientX);
    const startDate = minutesToDate(dayIndex, minutes);
    const endDate = minutesToDate(dayIndex, minutes + MIN_SESSION_MINUTES);

    try {
      const created = await createTimeSession({
        task_id: taskId,
        description: null,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
      });
      setSessions((prev) => [created, ...prev]);
      toast({ title: "Sesion creada", status: "success" });
    } catch (error: any) {
      toast({
        title: "Error al crear sesion",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    } finally {
      setDragTaskId(null);
    }
  };

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box
        borderRadius="2xl"
        p={{ base: 6, md: 8 }}
        bgGradient="linear(120deg, #0f3d2e 0%, #0c6b3f 55%, #caa85b 110%)"
        color="white"
        boxShadow="lg"
        position="relative"
        overflow="hidden"
        animation={`${fadeUp} 0.6s ease-out`}
        mb={8}
      >
        <Box
          position="absolute"
          inset="0"
          opacity={0.2}
          bgImage="radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4), transparent 55%)"
        />
        <Stack position="relative" spacing={1}>
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            Control de tiempo
          </Text>
          <Heading size="lg">Calendario interactivo</Heading>
        </Stack>
      </Box>

      <Box borderWidth="1px" borderRadius="xl" p={4} bg={panelBg} mb={6}>
        <SimpleGrid
          columns={{ base: 1, lg: 4 }}
          spacing={4}
          alignItems="center"
        >
          <Box>
            <Text fontSize="xs" color={subtleText}>
              Total Horas Semanal
            </Text>
            <Text fontSize="lg" fontWeight="semibold">
              {formatSeconds(totalWeekSeconds)}
            </Text>
          </Box>
          <FormControl>
            {/* Seleccion de la tarea para trabajar. */}
            <FormLabel>Que estas trabajando?</FormLabel>
            <Select
              value={taskIdInput}
              onChange={(e) => handleTaskSelectionChange(e.target.value)}
              placeholder="Selecciona una tarea"
              isDisabled={isLoading}
            >
              {tasks.map((task) => (
                <option key={task.id} value={String(task.id)}>
                  #{task.id} - {task.title}
                </option>
              ))}
            </Select>
            {tasksError && (
              <Text fontSize="xs" color="red.400" mt={2}>
                {tasksError}
              </Text>
            )}
          </FormControl>
          <HStack spacing={3} justify="flex-end" w="100%">
            {/* Boton de inicio: icono redondo con el mismo tamano que detener. */}
            <IconButton
              aria-label="Iniciar"
              icon={<FaPlay />}
              colorScheme="green"
              isRound
              size="lg"
              w="48px"
              h="48px"
              onClick={handleStart}
              isLoading={isLoading && !isRunning}
              isDisabled={isRunning}
            />
            {/* Boton de detener: icono redondo, mismo tamano y conectado al handler. */}
            <IconButton
              aria-label="Detener"
              icon={<FaStop />}
              colorScheme="red"
              variant="outline"
              isRound
              size="lg"
              w="48px"
              h="48px"
              onClick={handleStop}
              isLoading={isLoading && isRunning}
              isDisabled={!isRunning}
            />
          </HStack>
          <Box textAlign={{ base: "left", lg: "right" }}>
            <Badge colorScheme={isRunning ? "green" : "gray"}>
              {isRunning ? "En progreso" : "Sin actividad"}
            </Badge>
            {isRunning && (
              <Text fontSize="2xl" fontFamily="mono" mt={1}>
                {formattedElapsed}
              </Text>
            )}
          </Box>
        </SimpleGrid>
      </Box>

      <HStack spacing={3} mb={4} align="center">
        <Button
          variant={viewMode === "calendar" ? "solid" : "outline"}
          onClick={() => setViewMode("calendar")}
        >
          Calendario
        </Button>
        <Button
          variant={viewMode === "list" ? "solid" : "outline"}
          onClick={() => setViewMode("list")}
        >
          Vista de lista
        </Button>
        <Button
          variant={viewMode === "timesheet" ? "solid" : "outline"}
          onClick={() => setViewMode("timesheet")}
        >
          Hoja de horas
        </Button>
        <HStack marginLeft="auto" spacing={4} align="center">
          <HStack spacing={2}>
            <Text fontSize="sm" color={subtleText}>
              Ajuste
            </Text>
            <Select
              size="sm"
              value={minutesStep}
              onChange={(e) => setMinutesStep(Number(e.target.value))}
            >
              {MINUTES_STEP_OPTIONS.map((step) => (
                <option key={step} value={step}>
                  {step} min
                </option>
              ))}
            </Select>
          </HStack>
          <HStack spacing={2}>
            <Button
              variant="ghost"
              onClick={() => setWeekStart(startOfWeek(addDays(weekStart, -7)))}
            >
              Semana anterior
            </Button>
            <Button
              variant="ghost"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Hoy
            </Button>
            <Button
              variant="ghost"
              onClick={() => setWeekStart(startOfWeek(addDays(weekStart, 7)))}
            >
              Siguiente semana
            </Button>
          </HStack>
        </HStack>
      </HStack>

      {sessionsError && (
        <Text color="red.400" mb={4}>
          {sessionsError}
        </Text>
      )}

      {viewMode === "calendar" && (
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={panelBg} mb={4}>
          <HStack justify="space-between" align="center" mb={3}>
            <Heading size="sm">Ultimas tareas</Heading>
            <Text fontSize="xs" color={subtleText}>
              {currentUserId ? "Asignadas a ti" : "Recientes"}
            </Text>
          </HStack>
          {recentTasks.length === 0 ? (
            <Text fontSize="sm" color={mutedText}>
              No hay tareas recientes para mostrar.
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
              {recentTasks.map((task) => (
                <Box
                  key={task.id}
                  borderWidth="1px"
                  borderRadius="lg"
                  p={3}
                  bg={cardBg}
                  minW={0}
                  draggable
                  cursor="grab"
                  opacity={dragTaskId === task.id ? 0.6 : 1}
                  onDragStart={(event) => handleTaskDragStart(event, task.id)}
                  onDragEnd={() => setDragTaskId(null)}
                >
                  <Stack spacing={2}>
                    <Box>
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                        {task.title}
                      </Text>
                      <Text fontSize="xs" color={subtleText}>
                        #{task.id}
                      </Text>
                    </Box>
                    <Button
                      size="xs"
                      colorScheme="green"
                      alignSelf="flex-start"
                      onClick={() => handleQuickStart(task.id)}
                      isDisabled={isRunning}
                    >
                      Play
                    </Button>
                  </Stack>
                </Box>
              ))}
            </SimpleGrid>
          )}
        </Box>
      )}

      {viewMode === "calendar" && (
        <Box
          borderWidth="1px"
          borderRadius="xl"
          bg={cardBg}
          overflow="hidden"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleCalendarDrop}
        >
          <SimpleGrid columns={8} gap={0} borderBottomWidth="1px">
            <Box p={3} borderRightWidth="1px">
              <Text fontSize="xs" color={subtleText}>
                Hora
              </Text>
            </Box>
            {weekDays.map((day) => (
              <Box
                key={day.toISOString()}
                p={3}
                borderRightWidth="1px"
                bg={calendarHeaderBg}
              >
                <Text
                  fontSize="xs"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  color={calendarHeaderText}
                >
                  {formatDayLabel(day)}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
          <Box position="relative" ref={calendarRef}>
            {HOURS.map((hour) => (
              <SimpleGrid
                key={hour}
                columns={8}
                gap={0}
                minH={`${HOUR_HEIGHT}px`}
              >
                <Box
                  borderRightWidth="1px"
                  borderBottomWidth="1px"
                  p={2}
                  bg={panelBg}
                >
                  <Text fontSize="xs" color={subtleText}>
                    {hour.toString().padStart(2, "0")}:00
                  </Text>
                </Box>
                {weekDays.map((_, idx) => (
                  <Box
                    key={`${idx}-${hour}`}
                    borderRightWidth="1px"
                    borderBottomWidth="1px"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const minutes = getMinutesFromClientY(event.clientY);
                      startSelection(idx, minutes);
                    }}
                    _hover={{ bg: panelBg, cursor: "crosshair" }}
                  />
                ))}
              </SimpleGrid>
            ))}
            {weekDays.some(
              (day) => day.toDateString() === now.toDateString()
            ) && (
              <Box
                position="absolute"
                left="0"
                top={`${
                  ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT
                }px`}
                width="100%"
                height="2px"
                bg="red.400"
                boxShadow="sm"
                zIndex={2}
              >
                <Box
                  position="absolute"
                  top="-8px"
                  left="calc(12.5% + 8px)"
                  bg="red.400"
                  color="white"
                  px={2}
                  py={0.5}
                  borderRadius="full"
                  fontSize="xs"
                >
                  Ahora
                </Box>
              </Box>
            )}
            {dragState &&
              (dragState.mode === "move" || dragState.mode === "resize") &&
              dragState.sessionId && (
                <Box
                  position="absolute"
                  left={`calc(${(dragState.dayIndex + 1) * 12.5}% )`}
                  top={`${(dragState.startMinutes / 60) * HOUR_HEIGHT}px`}
                  width="12.5%"
                  height={`${
                    ((dragState.endMinutes - dragState.startMinutes) / 60) *
                    HOUR_HEIGHT
                  }px`}
                  border="2px dashed"
                  borderColor={accent}
                  bg="rgba(0,102,43,0.08)"
                  borderRadius="md"
                  pointerEvents="none"
                  zIndex={3}
                >
                  <Box
                    position="absolute"
                    top="-18px"
                    left="4px"
                    bg={accent}
                    color="white"
                    px={2}
                    py={0.5}
                    borderRadius="full"
                    fontSize="xs"
                    boxShadow="sm"
                  >
                    {formatMinutesLabel(dragState.startMinutes)} -{" "}
                    {formatMinutesLabel(dragState.endMinutes)}
                  </Box>
                </Box>
              )}
            {selection && (
              <Box
                position="absolute"
                left={`calc(${(selection.dayIndex + 1) * 12.5}% )`}
                top={`${
                  (Math.min(selection.startMinutes, selection.endMinutes) /
                    60) *
                  HOUR_HEIGHT
                }px`}
                width="12.5%"
                height={`${
                  (Math.max(
                    MIN_SESSION_MINUTES,
                    Math.abs(selection.endMinutes - selection.startMinutes)
                  ) /
                    60) *
                  HOUR_HEIGHT
                }px`}
                bg="rgba(0,102,43,0.08)"
                border="1px dashed"
                borderColor={accent}
                borderRadius="md"
              />
            )}
            {sessions.map((session) => {
              const start = new Date(session.started_at);
              const end = session.ended_at
                ? new Date(session.ended_at)
                : new Date(start.getTime() + MIN_SESSION_MINUTES * 60000);
              const dayIndex = weekDays.findIndex(
                (day) => day.toDateString() === start.toDateString()
              );
              if (dayIndex < 0) return null;
              const startMinutes = start.getHours() * 60 + start.getMinutes();
              const endMinutes = end.getHours() * 60 + end.getMinutes();
              const top = (startMinutes / 60) * HOUR_HEIGHT;
              const height = Math.max(
                HOUR_HEIGHT * (MIN_SESSION_MINUTES / 60),
                ((end.getTime() - start.getTime()) / 3600000) * HOUR_HEIGHT
              );
              const task = taskById.get(session.task_id);
              return (
                <Box
                  key={session.id}
                  position="absolute"
                  left={`calc(${(dayIndex + 1) * 12.5}% )`}
                  top={top}
                  width="12.5%"
                  height={`${height}px`}
                  bg="rgba(0,102,43,0.15)"
                  border="1px solid"
                  borderColor={accent}
                  borderRadius="md"
                  p={2}
                  overflow="visible"
                  cursor={
                    session.is_active
                      ? "default"
                      : isDraggingSession
                      ? "grabbing"
                      : "grab"
                  }
                  userSelect="none"
                  transition="box-shadow 0.2s ease, border-color 0.2s ease"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isDraggingSession) return;
                    openEditSession(session);
                  }}
                  onMouseDown={(event) => {
                    if (session.is_active) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const minutes = getMinutesFromClientY(event.clientY);
                    const offset = minutes - startMinutes;
                    setIsDraggingSession(true);
                    setDragState({
                      mode: "move",
                      sessionId: session.id,
                      dayIndex,
                      startMinutes,
                      endMinutes,
                      offsetMinutes: offset,
                    });
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    openEditSession(session);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleQuickDelete(session.id);
                  }}
                >
                  {!session.is_active && (
                    <Box
                      position="absolute"
                      top="2px"
                      left="2px"
                      right="28px"
                      height="16px"
                      borderRadius="full"
                      bg="rgba(0, 102, 43, 0.35)"
                      cursor="grab"
                      display="flex"
                      alignItems="center"
                      paddingLeft="6px"
                      fontSize="10px"
                      color="white"
                      textTransform="uppercase"
                      letterSpacing="0.06em"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const minutes = getMinutesFromClientY(event.clientY);
                        const offset = minutes - startMinutes;
                        setIsDraggingSession(true);
                        setDragState({
                          mode: "move",
                          sessionId: session.id,
                          dayIndex,
                          startMinutes,
                          endMinutes,
                          offsetMinutes: offset,
                        });
                      }}
                    >
                      Mover
                    </Box>
                  )}
                  <HStack
                    spacing={2}
                    justify="space-between"
                    align="start"
                    mb={1}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="semibold"
                      noOfLines={1}
                      mt={!session.is_active ? 2 : 0}
                    >
                      {task ? task.title : `Tarea #${session.task_id}`}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color={subtleText}>
                    {start.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {end.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  {session.description && (
                    <Text fontSize="xs" color={mutedText} noOfLines={1}>
                      {session.description}
                    </Text>
                  )}
                  {!session.is_active && (
                    <Box
                      position="absolute"
                      bottom="2px"
                      right="2px"
                      w="12px"
                      h="12px"
                      borderRadius="full"
                      bg={accent}
                      cursor="ns-resize"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsDraggingSession(true);
                        setDragState({
                          mode: "resize",
                          sessionId: session.id,
                          dayIndex,
                          startMinutes,
                          endMinutes,
                        });
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {viewMode === "list" && (
        <Stack spacing={3}>
          {isLoadingSessions && <Text>Cargando sesiones...</Text>}
          {!isLoadingSessions &&
            sessions.map((session) => {
              const task = taskById.get(session.task_id);
              return (
                <Box
                  key={session.id}
                  borderWidth="1px"
                  borderRadius="xl"
                  p={4}
                  bg={cardBg}
                  onClick={() => openEditSession(session)}
                  cursor="pointer"
                >
                  <HStack justify="space-between" align="flex-start">
                    <Box>
                      <Text fontWeight="semibold">
                        {task ? task.title : `Tarea #${session.task_id}`}
                      </Text>
                      <Text fontSize="sm" color={subtleText}>
                        {new Date(session.started_at).toLocaleString("es-ES")}
                      </Text>
                      {session.description && (
                        <Text fontSize="xs" color={mutedText} mt={1}>
                          {session.description}
                        </Text>
                      )}
                    </Box>
                    <VStack align="flex-end" spacing={2}>
                      <Badge colorScheme="green">
                        {formatSeconds(session.duration_seconds)}
                      </Badge>
                      <HStack>
                        {/* Accion coherente por fila: si la tarea esta activa, muestra stop; si no, play. */}
                        {isRunning && activeSession?.task_id === session.task_id ? (
                          <IconButton
                            aria-label="Detener"
                            icon={<FaStop />}
                            size="sm"
                            colorScheme="red"
                            variant="outline"
                            isRound
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStop();
                            }}
                            isLoading={isLoading && isRunning}
                            isDisabled={!isRunning}
                          />
                        ) : (
                          <IconButton
                            aria-label="Iniciar"
                            icon={<FaPlay />}
                            size="sm"
                            colorScheme="green"
                            isRound
                            onClick={(event) => {
                              event.stopPropagation();
                              handleQuickStart(session.task_id);
                            }}
                            isDisabled={isRunning}
                          />
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditSession(session);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="xs"
                          colorScheme="red"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleQuickDelete(session.id);
                          }}
                        >
                          Borrar
                        </Button>
                      </HStack>
                    </VStack>
                  </HStack>
                </Box>
              );
            })}
        </Stack>
      )}

      {viewMode === "timesheet" && (
        <Stack spacing={4}>
          {weekDays.map((day) => {
            const daySessions = sessions.filter(
              (session) =>
                new Date(session.started_at).toDateString() ===
                day.toDateString()
            );
            const totalSeconds = daySessions.reduce(
              (acc, session) => acc + session.duration_seconds,
              0
            );
            return (
              <Box
                key={day.toISOString()}
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
              >
                <HStack justify="space-between">
                  <Text fontWeight="semibold">{formatDayLabel(day)}</Text>
                  <Badge>{formatSeconds(totalSeconds)}</Badge>
                </HStack>
                <Divider my={3} />
                <Stack spacing={2}>
                  {daySessions.length === 0 && (
                    <Text fontSize="sm" color={mutedText}>
                      Sin sesiones registradas.
                    </Text>
                  )}
                  {daySessions.map((session) => {
                    const task = taskById.get(session.task_id);
                    return (
                      <HStack
                        key={session.id}
                        justify="space-between"
                        align="flex-start"
                        onClick={() => openEditSession(session)}
                        cursor="pointer"
                      >
                        <Box>
                          <Text fontSize="sm">
                            {task ? task.title : `Tarea #${session.task_id}`}
                          </Text>
                          {session.description && (
                            <Text fontSize="xs" color={mutedText}>
                              {session.description}
                            </Text>
                          )}
                        </Box>
                        <HStack spacing={3}>
                          <Text fontSize="sm" color={subtleText}>
                            {formatSeconds(session.duration_seconds)}
                          </Text>
                          {/* Accion coherente por fila: si la tarea esta activa, muestra stop; si no, play. */}
                          {isRunning && activeSession?.task_id === session.task_id ? (
                            <IconButton
                              aria-label="Detener"
                              icon={<FaStop />}
                              size="sm"
                              colorScheme="red"
                              variant="outline"
                              isRound
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStop();
                              }}
                              isLoading={isLoading && isRunning}
                              isDisabled={!isRunning}
                            />
                          ) : (
                            <IconButton
                              aria-label="Iniciar"
                              icon={<FaPlay />}
                              size="sm"
                              colorScheme="green"
                              isRound
                              onClick={(event) => {
                                event.stopPropagation();
                                handleQuickStart(session.task_id);
                              }}
                              isDisabled={isRunning}
                            />
                          )}
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditSession(session);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="xs"
                            colorScheme="red"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleQuickDelete(session.id);
                            }}
                          >
                            Borrar
                          </Button>
                        </HStack>
                      </HStack>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      <Modal isOpen={isOpen} onClose={handleCloseModal} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editingSessionId ? "Editar sesion" : "Crear sesion"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <FormControl>
                <FormLabel>Tarea</FormLabel>
                <Select
                  value={draftTaskId}
                  onChange={(e) => setDraftTaskId(e.target.value)}
                  placeholder="Selecciona una tarea"
                >
                  {tasks.map((task) => (
                    <option key={task.id} value={String(task.id)}>
                      #{task.id} - {task.title}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Descripcion</FormLabel>
                <Input
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Opcional"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Inicio</FormLabel>
                <Input
                  type="datetime-local"
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Fin</FormLabel>
                <Input
                  type="datetime-local"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseModal}>
              Cancelar
            </Button>
            {editingSessionId && (
              <Button
                colorScheme="red"
                variant="outline"
                mr={3}
                onClick={handleDeleteSession}
              >
                Eliminar
              </Button>
            )}
            <Button colorScheme="green" onClick={handleSaveSession}>
              {editingSessionId ? "Actualizar" : "Guardar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppShell>
  );
};
