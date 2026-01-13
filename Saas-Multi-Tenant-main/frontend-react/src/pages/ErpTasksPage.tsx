import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  FormControl,
  FormLabel,
  Heading,
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
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import {
  createErpTask,
  updateErpTask,
  type ErpTaskCreate,
} from "../api/erpManagement";
import { fetchErpTasks, type ErpTask } from "../api/erpTimeTracking";
import { fetchUsersByTenant, type TenantUserSummary } from "../api/users";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";

// Pantalla de tareas: resumen, creacion, Kanban y detalle.
export const ErpTasksPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const accent = useColorModeValue("brand.500", "brand.300");
  const pendingColumnBg = useColorModeValue("orange.50", "orange.900");
  const pendingHeaderBg = useColorModeValue("orange.500", "orange.400");
  const pendingBadgeBg = useColorModeValue("orange.200", "orange.600");
  const progressColumnBg = useColorModeValue("purple.50", "purple.900");
  const progressHeaderBg = useColorModeValue("purple.500", "purple.400");
  const progressBadgeBg = useColorModeValue("purple.200", "purple.600");
  const doneColumnBg = useColorModeValue("green.50", "green.900");
  const doneHeaderBg = useColorModeValue("green.500", "green.400");
  const doneBadgeBg = useColorModeValue("green.200", "green.600");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  type KanbanStatus = "pending" | "in_progress" | "done";
  const kanbanColumns: { id: KanbanStatus; label: string; color: string }[] = [
    { id: "pending", label: "Pendiente", color: "gray" },
    { id: "in_progress", label: "En progreso", color: "orange" },
    { id: "done", label: "Hecho", color: "green" },
  ];
  const statusLabels: Record<KanbanStatus, string> = {
    pending: "Pendiente",
    in_progress: "En curso",
    done: "Completado",
  };

  // Estado del formulario de tareas y modales.
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string>("");
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskEndDate, setTaskEndDate] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<KanbanStatus>("pending");
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddDescription, setQuickAddDescription] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState<string>("");
  const [quickAddAssigneeId, setQuickAddAssigneeId] = useState<string>("");
  const [quickAddStartDate, setQuickAddStartDate] = useState("");
  const [quickAddEndDate, setQuickAddEndDate] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProjectId, setEditProjectId] = useState<string>("");
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editStatus, setEditStatus] = useState<KanbanStatus>("pending");
  const [selectedTask, setSelectedTask] = useState<ErpTask | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    Record<number, KanbanStatus>
  >({});

  // Determina permisos y tenant del usuario actual.
  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id ?? 1;
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);

  // Datos principales del ERP.
  const { data: projects } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects"],
    queryFn: fetchErpProjects,
  });

  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: ["erp-tasks"],
    queryFn: fetchErpTasks,
  });

  const { data: users } = useQuery<TenantUserSummary[]>({
    queryKey: ["tenant-users", tenantId],
    queryFn: () => fetchUsersByTenant(tenantId),
  });

  // Mapas auxiliares para mostrar nombres en el Kanban.
  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    (users ?? []).forEach((user) => {
      map.set(user.id, user.full_name || user.email);
    });
    return map;
  }, [users]);

  const projectMap = useMemo(() => {
    const map = new Map<number, string>();
    (projects ?? []).forEach((project) => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  // Identifica al usuario actual para tareas asignadas.
  const currentUserId = currentUser?.id ?? null;

  // Lista de tareas asignadas al usuario actual.
  const assignedTasks = useMemo(() => {
    if (!currentUserId) return [];
    return (tasks ?? []).filter(
      (task) => task.assigned_to_id === currentUserId
    );
  }, [tasks, currentUserId]);

  // KPIs del resumen.
  const taskCount = tasks?.length ?? 0;
  const assignedCount =
    tasks?.filter((task) => task.assigned_to_id).length ?? 0;

  // Mutaciones para crear y editar tareas.
  const createTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) => createErpTask(payload),
    onSuccess: async () => {
      setTaskTitle("");
      setTaskDescription("");
      setTaskProjectId("");
      setTaskAssigneeId("");
      setTaskStartDate("");
      setTaskEndDate("");
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({ title: "Tarea creada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo crear la tarea",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  const quickCreateTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) => createErpTask(payload),
    onSuccess: async () => {
      setQuickAddTitle("");
      setQuickAddDescription("");
      setQuickAddProjectId("");
      setQuickAddAssigneeId("");
      setQuickAddStartDate("");
      setQuickAddEndDate("");
      setQuickAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({ title: "Tarea creada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo crear la tarea",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  // Actualizacion optimista del estado en Kanban.
  const updateTaskStatusMutation = useMutation({
    mutationFn: async (payload: { taskId: number; status: KanbanStatus }) => {
      await updateErpTask(payload.taskId, { status: payload.status });
    },
    onError: (error: any, variables) => {
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[variables.taskId];
        return next;
      });
      toast({
        title: "No se pudo mover la tarea",
        description:
          error?.response?.data?.detail ?? "Revisa permisos y datos.",
        status: "error",
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async () => {
      if (!editTaskId) return;
      await updateErpTask(editTaskId, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        project_id: editProjectId ? Number(editProjectId) : null,
        assigned_to_id: editAssigneeId ? Number(editAssigneeId) : null,
        start_date: editStartDate || null,
        end_date: editEndDate || null,
        status: editStatus,
      });
    },
    onSuccess: async () => {
      setEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({ title: "Tarea actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo actualizar la tarea",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  // Envia el formulario de creacion de tarea.
  const handleCreateTask = () => {
    if (!taskTitle.trim()) {
      toast({ title: "Titulo requerido", status: "warning" });
      return;
    }

    const payload: ErpTaskCreate = {
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      project_id: taskProjectId ? Number(taskProjectId) : null,
      assigned_to_id: taskAssigneeId ? Number(taskAssigneeId) : null,
      start_date: taskStartDate || null,
      end_date: taskEndDate || null,
    };

    createTaskMutation.mutate(payload);
  };

  // Abre el modal de alta rapida en una columna.
  const openQuickAdd = (status: KanbanStatus) => {
    setQuickAddStatus(status);
    setQuickAddOpen(true);
  };

  // Crea una tarea desde el modal rapido.
  const handleQuickAdd = () => {
    if (!quickAddTitle.trim()) {
      toast({ title: "Titulo requerido", status: "warning" });
      return;
    }

    const payload: ErpTaskCreate = {
      title: quickAddTitle.trim(),
      description: quickAddDescription.trim() || null,
      project_id: quickAddProjectId ? Number(quickAddProjectId) : null,
      assigned_to_id: quickAddAssigneeId ? Number(quickAddAssigneeId) : null,
      start_date: quickAddStartDate || null,
      end_date: quickAddEndDate || null,
      status: quickAddStatus,
    };

    quickCreateTaskMutation.mutate(payload);
  };

  const openEditTask = (task: ErpTask) => {
    setEditTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditProjectId(task.project_id ? String(task.project_id) : "");
    setEditAssigneeId(task.assigned_to_id ? String(task.assigned_to_id) : "");
    setEditStartDate(task.start_date ?? "");
    setEditEndDate(task.end_date ?? "");
    setEditStatus(getTaskStatus(task));
    setEditOpen(true);
  };

  // Normaliza el estado para la vista Kanban.
  const getTaskStatus = (task: ErpTask): KanbanStatus => {
    const raw = task.status?.toLowerCase();
    if (raw === "pending" || raw === "in_progress" || raw === "done") {
      return raw;
    }
    return task.is_completed ? "done" : "pending";
  };

  // Agrupa tareas por estado para las columnas.
  const tasksByStatus = useMemo(() => {
    const groups: Record<KanbanStatus, ErpTask[]> = {
      pending: [],
      in_progress: [],
      done: [],
    };
    (tasks ?? []).forEach((task) => {
      const status = optimisticStatus[task.id] ?? getTaskStatus(task);
      groups[status].push(task);
    });
    return groups;
  }, [tasks, optimisticStatus]);

  // Manejo de drag and drop en Kanban.
  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: number
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
    setDraggedTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverStatus(null);
  };

  const handleDragOver =
    (status: KanbanStatus) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverStatus(status);
    };

  const handleDrop =
    (status: KanbanStatus) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rawId = event.dataTransfer.getData("text/plain");
      const taskId = Number(rawId);
      if (!taskId) return;
      const task = (tasks ?? []).find((item) => item.id === taskId);
      if (!task) return;
      const currentStatus = optimisticStatus[taskId] ?? getTaskStatus(task);
      if (currentStatus === status) return;
      setOptimisticStatus((prev) => ({ ...prev, [taskId]: status }));
      updateTaskStatusMutation.mutate({ taskId, status });
      setDragOverStatus(null);
    };

  const kanbanStyles = {
    pending: {
      columnBg: pendingColumnBg,
      headerBg: pendingHeaderBg,
      badgeBg: pendingBadgeBg,
      accent: "orange",
    },
    in_progress: {
      columnBg: progressColumnBg,
      headerBg: progressHeaderBg,
      badgeBg: progressBadgeBg,
      accent: "purple",
    },
    done: {
      columnBg: doneColumnBg,
      headerBg: doneHeaderBg,
      badgeBg: doneBadgeBg,
      accent: "green",
    },
  } as const;

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
        <Stack position="relative" spacing={4} maxW="680px">
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            ERP Interno
          </Text>
          <Heading size="lg">Tareas y seguimiento del equipo</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Organiza trabajo diario, mueve prioridades y sigue el estado en
            vivo.
          </Text>
          <SimpleGrid
            columns={{ base: 1, md: 2 }}
            spacing={4}
            pt={2}
            maxW="420px"
          >
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                Tareas totales
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {taskCount}
              </Text>
            </Box>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                Tareas asignadas
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {assignedCount}
              </Text>
            </Box>
          </SimpleGrid>
        </Stack>
      </Box>

      <Tabs variant="enclosed" colorScheme="green" isLazy>
        <TabList flexWrap="wrap" gap={2}>
          <Tab>Resumen</Tab>
          <Tab>Crear</Tab>
          <Tab>Kanban</Tab>
        </TabList>
        <TabPanels mt={6}>
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
              <Box
                as={Link}
                to="/erp/projects"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color={subtleText}
                >
                  Proyectos
                </Text>
                <Heading size="sm" mb={1}>
                  Gestion de proyectos
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  Crea proyectos, asigna fechas y revisa el Gantt.
                </Text>
              </Box>
              <Box
                as={Link}
                to="/erp/time-control"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color={subtleText}
                >
                  Tiempo en vivo
                </Text>
                <Heading size="sm" mb={1}>
                  Control de tiempo
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  Inicia y detiene sesiones sin salir del tablero.
                </Text>
              </Box>
              <Box
                as={Link}
                to="/erp/time-report"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color={subtleText}
                >
                  Analitica
                </Text>
                <Heading size="sm" mb={1}>
                  Informe de horas
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  Controla coste y rendimiento por usuario.
                </Text>
              </Box>
            </SimpleGrid>
            <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
              <Heading size="sm" mb={3}>
                Mis tareas asignadas
              </Heading>
              {assignedTasks.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  No tienes tareas asignadas ahora mismo.
                </Text>
              ) : (
                <Stack spacing={3}>
                  {assignedTasks.slice(0, 10).map((task) => (
                    <Box
                      key={task.id}
                      borderWidth="1px"
                      borderRadius="lg"
                      p={3}
                    >
                      <Text fontWeight="semibold">{task.title}</Text>
                      <Text fontSize="xs" color={subtleText}>
                        {task.project_id
                          ? `Proyecto: ${
                              projectMap.get(task.project_id) ?? task.project_id
                            }`
                          : "Sin proyecto"}
                      </Text>
                      <Badge
                        mt={2}
                        colorScheme={kanbanStyles[getTaskStatus(task)].accent}
                      >
                        {statusLabels[getTaskStatus(task)]}
                      </Badge>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </TabPanel>
          <TabPanel px={0}>
            <Box
              borderWidth="1px"
              borderRadius="xl"
              p={6}
              bg={panelBg}
              maxW="640px"
            >
              <Heading size="sm" mb={4}>
                Crear tarea
              </Heading>
              <Stack spacing={3}>
                <FormControl>
                  <FormLabel>Titulo de la tarea</FormLabel>
                  <Input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Descripcion</FormLabel>
                  <Textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    rows={3}
                  />
                </FormControl>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <FormControl>
                    <FormLabel>Inicio</FormLabel>
                    <Input
                      type="date"
                      value={taskStartDate}
                      onChange={(e) => setTaskStartDate(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Fin</FormLabel>
                    <Input
                      type="date"
                      value={taskEndDate}
                      onChange={(e) => setTaskEndDate(e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>
                <FormControl>
                  <FormLabel>Proyecto</FormLabel>
                  <Select
                    placeholder="Sin proyecto"
                    value={taskProjectId}
                    onChange={(e) => setTaskProjectId(e.target.value)}
                  >
                    {(projects ?? []).map((project) => (
                      <option key={project.id} value={String(project.id)}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Asignar a</FormLabel>
                  <Select
                    placeholder={
                      isSuperAdmin
                        ? "Selecciona usuario"
                        : "Usuarios del tenant"
                    }
                    value={taskAssigneeId}
                    onChange={(e) => setTaskAssigneeId(e.target.value)}
                  >
                    {(users ?? []).map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.full_name || user.email}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  colorScheme="green"
                  onClick={handleCreateTask}
                  isLoading={createTaskMutation.isPending}
                  alignSelf="flex-start"
                >
                  Crear tarea
                </Button>
              </Stack>
            </Box>
          </TabPanel>
          <TabPanel px={0}>
            <Heading size="md" mb={2}>
              Tareas
            </Heading>
            <Text fontSize="sm" color={subtleText} mb={4}>
              Arrastra las tarjetas para actualizar su estado de forma
              inmediata.
            </Text>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              {kanbanColumns.map((column) => (
                <Box
                  key={column.id}
                  borderWidth="1px"
                  borderRadius="xl"
                  bg={kanbanStyles[column.id].columnBg}
                  p={4}
                  minH="280px"
                  borderColor={
                    dragOverStatus === column.id ? accent : "transparent"
                  }
                  boxShadow={dragOverStatus === column.id ? "sm" : "none"}
                  onDragOver={handleDragOver(column.id)}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={handleDrop(column.id)}
                >
                  <Stack
                    direction="row"
                    justify="space-between"
                    align="center"
                    mb={4}
                  >
                    <Stack direction="row" spacing={2} align="center">
                      <Box
                        px={3}
                        py={1}
                        borderRadius="full"
                        bg={kanbanStyles[column.id].headerBg}
                        color="white"
                        fontSize="xs"
                        fontWeight="semibold"
                        textTransform="uppercase"
                        letterSpacing="0.04em"
                      >
                        {column.label}
                      </Box>
                      <Badge
                        bg={kanbanStyles[column.id].badgeBg}
                        color="gray.800"
                        borderRadius="full"
                      >
                        {tasksByStatus[column.id].length}
                      </Badge>
                    </Stack>
                  </Stack>
                  <Stack spacing={3} mb={3}>
                    {tasksByStatus[column.id].length === 0 ? (
                      <Text fontSize="sm" color={subtleText}>
                        Sin tareas
                      </Text>
                    ) : (
                      tasksByStatus[column.id].map((task) => (
                        <Box
                          key={task.id}
                          borderWidth="1px"
                          borderRadius="lg"
                          p={3}
                          bg={cardBg}
                          boxShadow="sm"
                          cursor="grab"
                          opacity={draggedTaskId === task.id ? 0.6 : 1}
                          draggable
                          onDragStart={(event) =>
                            handleDragStart(event, task.id)
                          }
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedTask(task)}
                          _hover={{ borderColor: accent, boxShadow: "md" }}
                        >
                          <Stack spacing={2}>
                            <Box>
                              <Heading size="sm">{task.title}</Heading>
                              <Text fontSize="xs" color={subtleText}>
                                {task.project_id
                                  ? `En ${
                                      projectMap.get(task.project_id) ??
                                      "Proyecto"
                                    }`
                                  : "Sin proyecto"}
                              </Text>
                            </Box>
                            <Stack
                              direction="row"
                              spacing={2}
                              align="center"
                              flexWrap="wrap"
                            >
                              {task.assigned_to_id && (
                                <Badge variant="subtle" colorScheme="purple">
                                  {userMap.get(task.assigned_to_id) ??
                                    task.assigned_to_id}
                                </Badge>
                              )}
                              {task.start_date && (
                                <Badge variant="subtle" colorScheme="gray">
                                  {task.start_date}
                                </Badge>
                              )}
                            </Stack>
                            {task.description && (
                              <Text
                                fontSize="xs"
                                color={subtleText}
                                noOfLines={2}
                              >
                                {task.description}
                              </Text>
                            )}
                            <Button
                              size="xs"
                              variant="outline"
                              colorScheme="green"
                              alignSelf="flex-start"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditTask(task);
                              }}
                            >
                              Editar
                            </Button>
                          </Stack>
                        </Box>
                      ))
                    )}
                  </Stack>
                  <Button
                    variant="ghost"
                    size="sm"
                    colorScheme={kanbanStyles[column.id].accent}
                    onClick={() => openQuickAdd(column.id)}
                  >
                    + Anadir tarea
                  </Button>
                </Box>
              ))}
            </SimpleGrid>
            <Modal
              isOpen={quickAddOpen}
              onClose={() => setQuickAddOpen(false)}
              size="lg"
            >
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Crear tarea</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Stack spacing={3}>
                    <Text fontSize="sm" color={subtleText}>
                      Estado: {statusLabels[quickAddStatus]}
                    </Text>
                    <FormControl>
                      <FormLabel>Nombre de la tarea</FormLabel>
                      <Input
                        placeholder="Escribe el titulo"
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Descripcion</FormLabel>
                      <Textarea
                        value={quickAddDescription}
                        onChange={(e) => setQuickAddDescription(e.target.value)}
                        rows={3}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Proyecto</FormLabel>
                      <Select
                        placeholder="Sin proyecto"
                        value={quickAddProjectId}
                        onChange={(e) => setQuickAddProjectId(e.target.value)}
                      >
                        {(projects ?? []).map((project) => (
                          <option key={project.id} value={String(project.id)}>
                            {project.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Asignar a</FormLabel>
                      <Select
                        placeholder={
                          isSuperAdmin
                            ? "Selecciona usuario"
                            : "Usuarios del tenant"
                        }
                        value={quickAddAssigneeId}
                        onChange={(e) => setQuickAddAssigneeId(e.target.value)}
                      >
                        {(users ?? []).map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.full_name || user.email}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                      <FormControl>
                        <FormLabel>Inicio</FormLabel>
                        <Input
                          type="date"
                          value={quickAddStartDate}
                          onChange={(e) => setQuickAddStartDate(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Fin</FormLabel>
                        <Input
                          type="date"
                          value={quickAddEndDate}
                          onChange={(e) => setQuickAddEndDate(e.target.value)}
                        />
                      </FormControl>
                    </SimpleGrid>
                  </Stack>
                </ModalBody>
                <ModalFooter>
                  <Button
                    variant="ghost"
                    mr={3}
                    onClick={() => setQuickAddOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    colorScheme="green"
                    onClick={handleQuickAdd}
                    isLoading={quickCreateTaskMutation.isPending}
                  >
                    Guardar
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
            <Modal
              isOpen={editOpen}
              onClose={() => setEditOpen(false)}
              size="lg"
            >
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Editar tarea</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Stack spacing={3}>
                    <FormControl>
                      <FormLabel>Titulo</FormLabel>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Descripcion</FormLabel>
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={3}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Estado</FormLabel>
                      <Select
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(e.target.value as KanbanStatus)
                        }
                      >
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Proyecto</FormLabel>
                      <Select
                        placeholder="Sin proyecto"
                        value={editProjectId}
                        onChange={(e) => setEditProjectId(e.target.value)}
                      >
                        {(projects ?? []).map((project) => (
                          <option key={project.id} value={String(project.id)}>
                            {project.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Asignar a</FormLabel>
                      <Select
                        placeholder={
                          isSuperAdmin
                            ? "Selecciona usuario"
                            : "Usuarios del tenant"
                        }
                        value={editAssigneeId}
                        onChange={(e) => setEditAssigneeId(e.target.value)}
                      >
                        {(users ?? []).map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.full_name || user.email}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                      <FormControl>
                        <FormLabel>Inicio</FormLabel>
                        <Input
                          type="date"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Fin</FormLabel>
                        <Input
                          type="date"
                          value={editEndDate}
                          onChange={(e) => setEditEndDate(e.target.value)}
                        />
                      </FormControl>
                    </SimpleGrid>
                  </Stack>
                </ModalBody>
                <ModalFooter>
                  <Button
                    variant="ghost"
                    mr={3}
                    onClick={() => setEditOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    colorScheme="green"
                    onClick={() => updateTaskMutation.mutate()}
                    isLoading={updateTaskMutation.isPending}
                    isDisabled={!editTaskId || !editTitle.trim()}
                  >
                    Guardar cambios
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Drawer
        isOpen={Boolean(selectedTask)}
        placement="right"
        onClose={() => setSelectedTask(null)}
        size="md"
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Detalle de tarea</DrawerHeader>
          <DrawerBody>
            {selectedTask ? (
              <Stack spacing={4}>
                <Box>
                  <Heading size="md">{selectedTask.title}</Heading>
                  <Text fontSize="sm" color={subtleText}>
                    {selectedTask.project_id
                      ? `Proyecto: ${
                          projectMap.get(selectedTask.project_id) ??
                          "Sin nombre"
                        }`
                      : "Sin proyecto"}
                  </Text>
                </Box>
                <Badge
                  alignSelf="flex-start"
                  colorScheme={kanbanStyles[getTaskStatus(selectedTask)].accent}
                  variant="solid"
                >
                  {statusLabels[getTaskStatus(selectedTask)]}
                </Badge>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Asignado
                    </Text>
                    <Text fontWeight="semibold">
                      {selectedTask.assigned_to_id
                        ? userMap.get(selectedTask.assigned_to_id) ??
                          selectedTask.assigned_to_id
                        : "Sin asignar"}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Estado
                    </Text>
                    <Text fontWeight="semibold">
                      {statusLabels[getTaskStatus(selectedTask)]}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Inicio
                    </Text>
                    <Text fontWeight="semibold">
                      {selectedTask.start_date ?? "Sin fecha"}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Fin
                    </Text>
                    <Text fontWeight="semibold">
                      {selectedTask.end_date ?? "Sin fecha"}
                    </Text>
                  </Box>
                </SimpleGrid>
                <Box>
                  <Text fontSize="xs" color={subtleText}>
                    Descripcion
                  </Text>
                  <Text>
                    {selectedTask.description?.trim()
                      ? selectedTask.description
                      : "Sin descripcion"}
                  </Text>
                </Box>
              </Stack>
            ) : null}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </AppShell>
  );
};
