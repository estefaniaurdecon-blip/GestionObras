import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
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
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import {
  createErpTask,
  deleteErpTask,
  updateErpTask,
  type ErpTaskCreate,
} from "../api/erpManagement";
import { fetchErpTasks, type ErpTask } from "../api/erpTimeTracking";
import { fetchUsersByTenant, type TenantUserSummary } from "../api/users";
import {
  fetchActivities,
  fetchSubActivities,
  type ErpActivity,
  type ErpSubActivity,
} from "../api/erpStructure";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";

// Pantalla de tareas: resumen, creacion, Kanban y detalle.
export const ErpTasksPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t, i18n } = useTranslation();
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
  const padDatePart = (value: number) => String(value).padStart(2, "0");
  const toDateTimeInput = (value?: string | null) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return `${parsed.getFullYear()}-${padDatePart(
      parsed.getMonth() + 1,
    )}-${padDatePart(parsed.getDate())}T${padDatePart(
      parsed.getHours(),
    )}:${padDatePart(parsed.getMinutes())}`;
  };
  const formatTaskDateTime = (value?: string | null) => {
    if (!value) return t("erp.tasks.drawer.noDate");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString(i18n.language, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  type KanbanStatus = "pending" | "in_progress" | "done";
  const kanbanColumns: { id: KanbanStatus; label: string; color: string }[] =
    useMemo(
      () => [
        { id: "pending", label: t("erp.tasks.status.pending"), color: "gray" },
        {
          id: "in_progress",
          label: t("erp.tasks.status.inProgress"),
          color: "orange",
        },
        { id: "done", label: t("erp.tasks.status.done"), color: "green" },
      ],
      [t],
    );
  const statusLabels: Record<KanbanStatus, string> = useMemo(
    () => ({
      pending: t("erp.tasks.status.pending"),
      in_progress: t("erp.tasks.status.inProgressShort"),
      done: t("erp.tasks.status.doneShort"),
    }),
    [t],
  );

  // Estado del formulario de tareas y modales.
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string>("");
  const [taskSubactivityId, setTaskSubactivityId] = useState<string>("");
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskEndDate, setTaskEndDate] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<KanbanStatus>("pending");
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddDescription, setQuickAddDescription] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState<string>("");
  const [quickAddSubactivityId, setQuickAddSubactivityId] =
    useState<string>("");
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
  const [editSubactivityId, setEditSubactivityId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<KanbanStatus>("pending");
  const [selectedTask, setSelectedTask] = useState<ErpTask | null>(null);
  const [viewTask, setViewTask] = useState<ErpTask | null>(null);
  const [deletedTaskIds, setDeletedTaskIds] = useState<number[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    Record<number, KanbanStatus>
  >({});
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Determina permisos y tenant del usuario actual.
  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id;
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const effectiveTenantId = isSuperAdmin
    ? undefined
    : (currentUser?.tenant_id ?? undefined);

  // Datos principales del ERP.
  const { data: projects } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects", effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProjects(effectiveTenantId),
  });

  const { data: activities = [] } = useQuery<ErpActivity[]>({
    queryKey: ["erp-activities", effectiveTenantId ?? "all"],
    queryFn: () => fetchActivities(undefined, effectiveTenantId),
  });

  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: ["erp-tasks", effectiveTenantId ?? "all"],
    queryFn: () => fetchErpTasks(effectiveTenantId),
  });

  const { data: subactivities = [] } = useQuery<ErpSubActivity[]>({
    queryKey: ["erp-subactivities", effectiveTenantId ?? "all"],
    queryFn: () => fetchSubActivities({}, effectiveTenantId),
  });

  const { data: users } = useQuery<TenantUserSummary[]>({
    queryKey: ["tenant-users", tenantId],
    queryFn: () => fetchUsersByTenant(tenantId),
  });

  const allTasks = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) =>
          t.status?.toLowerCase() !== "deleted" &&
          !deletedTaskIds.includes(t.id),
      ),
    [tasks, deletedTaskIds],
  );

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

  const subactivitiesByProject = useMemo(() => {
    const map = new Map<number, ErpSubActivity[]>();
    subactivities.forEach((sub) => {
      // Usamos activities para conocer el project_id de la subactividad.
      const parentActivity = activities.find(
        (act) => act.id === sub.activity_id,
      );
      if (!parentActivity) return;
      const key = parentActivity.project_id;
      const arr = map.get(key) ?? [];
      arr.push(sub);
      map.set(key, arr);
    });
    return map;
  }, [subactivities, activities]);

  // Identifica al usuario actual para tareas asignadas.
  const currentUserId = currentUser?.id ?? null;

  // Lista de tareas asignadas al usuario actual.
  const assignedTasks = useMemo(() => {
    if (!currentUserId) return [];
    return allTasks.filter((task) => task.assigned_to_id === currentUserId);
  }, [allTasks, currentUserId]);

  // KPIs del resumen.
  const taskCount = allTasks.length;
  const assignedCount = assignedTasks.length;

  // Mutaciones para crear y editar tareas.
  const createTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) =>
      createErpTask(payload, effectiveTenantId),
    onSuccess: async () => {
      setTaskTitle("");
      setTaskDescription("");
      setTaskProjectId("");
      setTaskAssigneeId("");
      setTaskStartDate("");
      setTaskEndDate("");
      setTaskSubactivityId("");
      setCreateModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({
        title: t("erp.tasks.messages.createSuccess"),
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.createErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.createErrorFallback"),
        status: "error",
      });
    },
  });

  const quickCreateTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) =>
      createErpTask(payload, effectiveTenantId),
    onSuccess: async () => {
      setQuickAddTitle("");
      setQuickAddDescription("");
      setQuickAddProjectId("");
      setQuickAddAssigneeId("");
      setQuickAddStartDate("");
      setQuickAddEndDate("");
      setQuickAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({
        title: t("erp.tasks.messages.createSuccess"),
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.createErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.createErrorFallback"),
        status: "error",
      });
    },
  });

  // Actualizacion optimista del estado en Kanban.
  const updateTaskStatusMutation = useMutation({
    mutationFn: async (payload: { taskId: number; status: KanbanStatus }) => {
      await updateErpTask(
        payload.taskId,
        { status: payload.status },
        effectiveTenantId,
      );
    },
    onError: (error: any, variables) => {
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[variables.taskId];
        return next;
      });
      toast({
        title: t("erp.tasks.messages.moveErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.moveErrorFallback"),
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
      await updateErpTask(
        editTaskId,
        {
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          project_id: editProjectId ? Number(editProjectId) : null,
          subactivity_id: editSubactivityId ? Number(editSubactivityId) : null,
          assigned_to_id: editAssigneeId ? Number(editAssigneeId) : null,
          start_date: editStartDate || null,
          end_date: editEndDate || null,
          status: editStatus,
        },
        effectiveTenantId,
      );
    },
    onSuccess: async () => {
      setEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({
        title: t("erp.tasks.messages.updateSuccess"),
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.updateErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.updateErrorFallback"),
        status: "error",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => deleteErpTask(taskId),
    onSuccess: async (_data, taskId) => {
      setSelectedTask((prev) => (prev?.id === taskId ? null : prev));
      setViewTask(null);
      setEditOpen(false);
      setDeletedTaskIds((prev) => [...prev, taskId]);
      // Eliminamos la tarea del cache para que desaparezca sin esperar al refetch.
      queryClient.setQueryData<ErpTask[]>(["erp-tasks"], (prev) =>
        prev ? prev.filter((task) => task.id !== taskId) : prev,
      );
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      const deleteOk = t("erp.tasks.messages.deleteSuccess");
      toast({
        title:
          deleteOk && deleteOk !== "erp.tasks.messages.deleteSuccess"
            ? deleteOk
            : "Tarea eliminada",
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.deleteError") || "Error al eliminar tarea",
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.deleteErrorFallback") ??
          "No se pudo eliminar la tarea.",
        status: "error",
      });
    },
  });

  // Envia el formulario de creacion de tarea.
  const handleCreateTask = () => {
    if (!taskTitle.trim()) {
      toast({
        title: t("erp.tasks.messages.titleRequired"),
        status: "warning",
      });
      return;
    }

    const payload: ErpTaskCreate = {
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      project_id: taskProjectId ? Number(taskProjectId) : null,
      subactivity_id: taskSubactivityId ? Number(taskSubactivityId) : null,
      assigned_to_id: taskAssigneeId ? Number(taskAssigneeId) : null,
      start_date: taskStartDate || null,
      end_date: taskEndDate || null,
    };

    createTaskMutation.mutate(payload);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
  };

  // Abre el modal de alta rapida en una columna.
  const openQuickAdd = (status: KanbanStatus) => {
    setQuickAddStatus(status);
    setQuickAddOpen(true);
  };

  // Crea una tarea desde el modal rapido.
  const handleQuickAdd = () => {
    if (!quickAddTitle.trim()) {
      toast({
        title: t("erp.tasks.messages.titleRequired"),
        status: "warning",
      });
      return;
    }

    const payload: ErpTaskCreate = {
      title: quickAddTitle.trim(),
      description: quickAddDescription.trim() || null,
      project_id: quickAddProjectId ? Number(quickAddProjectId) : null,
      subactivity_id: quickAddSubactivityId
        ? Number(quickAddSubactivityId)
        : null,
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
    setEditSubactivityId(
      task.subactivity_id ? String(task.subactivity_id) : "",
    );
    setEditAssigneeId(task.assigned_to_id ? String(task.assigned_to_id) : "");
    setEditStartDate(toDateTimeInput(task.start_date));
    setEditEndDate(toDateTimeInput(task.end_date));
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
    allTasks.forEach((task) => {
      const status = optimisticStatus[task.id] ?? getTaskStatus(task);
      groups[status].push(task);
    });
    return groups;
  }, [allTasks, optimisticStatus]);

  // Manejo de drag and drop en Kanban.
  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: number,
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
        bgGradient="linear(120deg, var(--chakra-colors-brand-700) 0%, var(--chakra-colors-brand-500) 55%, var(--chakra-colors-brand-300) 110%)"
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
            {t("erp.tasks.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("erp.tasks.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("erp.tasks.header.subtitle")}
          </Text>
          <SimpleGrid
            columns={{ base: 1, md: 2 }}
            spacing={4}
            pt={2}
            maxW="420px"
          ></SimpleGrid>
        </Stack>
      </Box>

      <Tabs variant="enclosed" colorScheme="green">
        <TabList flexWrap="wrap" gap={2}>
          <Tab>{t("erp.tasks.tabs.summary")}</Tab>
          <Tab>{t("erp.tasks.tabs.kanban")}</Tab>
        </TabList>
        <TabPanels mt={6}>
          <TabPanel px={0}>
            <Button
              colorScheme="green"
              size="sm"
              mb={4}
              onClick={() => setCreateModalOpen(true)}
            >
              {t("erp.tasks.actions.create")}
            </Button>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
                <Stack
                  direction="row"
                  justify="space-between"
                  align="center"
                  mb={3}
                >
                  <Heading size="sm">{t("erp.tasks.summary.allTasks")}</Heading>
                  <Badge borderRadius="full" px={2}>
                    {allTasks.length}
                  </Badge>
                </Stack>
                {allTasks.length === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    {t("erp.tasks.summary.emptyAll")}
                  </Text>
                ) : (
                  <Stack spacing={3}>
                    {allTasks.slice(0, 10).map((task) => (
                      <Box
                        key={task.id}
                        borderWidth="1px"
                        borderRadius="lg"
                        p={3}
                        cursor="pointer"
                        _hover={{ borderColor: accent, boxShadow: "md" }}
                        onClick={() => setViewTask(task)}
                      >
                        <Stack
                          direction="row"
                          justify="space-between"
                          align="flex-start"
                        >
                          <Box>
                            <Text fontWeight="semibold">{task.title}</Text>
                            <Text fontSize="xs" color={subtleText}>
                              {task.project_id
                                ? t("erp.tasks.summary.projectLabel", {
                                    project:
                                      projectMap.get(task.project_id) ??
                                      task.project_id,
                                  })
                                : t("erp.tasks.summary.noProject")}
                            </Text>
                          </Box>
                          <Stack direction="row" spacing={2}>
                            <Button
                              size="xs"
                              variant="outline"
                              colorScheme="green"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewTask(task);
                              }}
                            >
                              {t("erp.tasks.actions.edit")}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              colorScheme="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTaskMutation.mutate(task.id);
                              }}
                              isLoading={deleteTaskMutation.isPending}
                            >
                              Eliminar
                            </Button>
                          </Stack>
                        </Stack>
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
              <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
                <Stack
                  direction="row"
                  justify="space-between"
                  align="center"
                  mb={3}
                >
                  <Heading size="sm">{t("erp.tasks.summary.assigned")}</Heading>
                  <Badge borderRadius="full" px={2}>
                    {assignedTasks.length}
                  </Badge>
                </Stack>
                {assignedTasks.length === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    {t("erp.tasks.summary.emptyAssigned")}
                  </Text>
                ) : (
                  <Stack spacing={3}>
                    {assignedTasks.slice(0, 10).map((task) => (
                      <Box
                        key={task.id}
                        borderWidth="1px"
                        borderRadius="lg"
                        p={3}
                        cursor="pointer"
                        _hover={{ borderColor: accent, boxShadow: "md" }}
                        onClick={() => setViewTask(task)}
                      >
                        <Stack
                          direction="row"
                          justify="space-between"
                          align="flex-start"
                        >
                          <Box>
                            <Text fontWeight="semibold">{task.title}</Text>
                            <Text fontSize="xs" color={subtleText}>
                              {task.project_id
                                ? t("erp.tasks.summary.projectLabel", {
                                    project:
                                      projectMap.get(task.project_id) ??
                                      task.project_id,
                                  })
                                : t("erp.tasks.summary.noProject")}
                            </Text>
                          </Box>
                          <Stack direction="row" spacing={2}>
                            <Button
                              size="xs"
                              variant="outline"
                              colorScheme="green"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewTask(task);
                              }}
                            >
                              {t("erp.tasks.actions.edit")}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              colorScheme="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTaskMutation.mutate(task.id);
                              }}
                              isLoading={deleteTaskMutation.isPending}
                            >
                              Eliminar
                            </Button>
                          </Stack>
                        </Stack>
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
            </SimpleGrid>
          </TabPanel>
          <TabPanel px={0}>
            <Heading size="md" mb={2}>
              {t("erp.tasks.kanban.title")}
            </Heading>
            <Text fontSize="sm" color={subtleText} mb={4}>
              {t("erp.tasks.kanban.subtitle")}
            </Text>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              {kanbanColumns.map((column) => (
                <Box
                  key={column.id}
                  borderWidth="1px"
                  borderRadius="xl"
                  bg={kanbanStyles[column.id].columnBg}
                  p={3}
                  minH="240px"
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
                  <Stack spacing={2} mb={3}>
                    {tasksByStatus[column.id].length === 0 ? (
                      <Text fontSize="sm" color={subtleText}>
                        {t("erp.tasks.kanban.empty")}
                      </Text>
                    ) : (
                      tasksByStatus[column.id].map((task) => (
                        <Box
                          key={task.id}
                          borderWidth="1px"
                          borderRadius="md"
                          p={2}
                          bg={cardBg}
                          boxShadow="xs"
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
                          <Stack spacing={1.5}>
                            <Box>
                              <Heading size="xs">{task.title}</Heading>
                              <Text
                                fontSize="xs"
                                color={subtleText}
                                noOfLines={1}
                              >
                                {task.project_id
                                  ? t("erp.tasks.kanban.projectLabel", {
                                      project:
                                        projectMap.get(task.project_id) ??
                                        t("erp.tasks.kanban.projectFallback"),
                                    })
                                  : t("erp.tasks.kanban.noProject")}
                              </Text>
                              {task.subactivity_id && (
                                <Text
                                  fontSize="xs"
                                  color={subtleText}
                                  noOfLines={1}
                                >
                                  Subactividad:{" "}
                                  {subactivities.find(
                                    (sub) => sub.id === task.subactivity_id,
                                  )?.name ?? task.subactivity_id}
                                </Text>
                              )}
                            </Box>
                            <Stack
                              direction="row"
                              spacing={1}
                              align="center"
                              flexWrap="wrap"
                            >
                              {task.assigned_to_id && (
                                <Badge
                                  variant="subtle"
                                  colorScheme="purple"
                                  fontSize="0.65rem"
                                >
                                  {userMap.get(task.assigned_to_id) ??
                                    task.assigned_to_id}
                                </Badge>
                              )}
                              {task.start_date && (
                                <Badge
                                  variant="subtle"
                                  colorScheme="gray"
                                  fontSize="0.65rem"
                                >
                                  {formatTaskDateTime(task.start_date)}
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
                            <Stack direction="row" spacing={2}>
                              <Button
                                size="xs"
                                variant="outline"
                                colorScheme="green"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditTask(task);
                                }}
                              >
                                {t("erp.tasks.actions.edit")}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                colorScheme="red"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteTaskMutation.mutate(task.id);
                                }}
                                isLoading={deleteTaskMutation.isPending}
                              >
                                Eliminar
                              </Button>
                            </Stack>
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
                    {t("erp.tasks.actions.addQuick")}
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
                <ModalHeader>{t("erp.tasks.create.title")}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Stack spacing={3}>
                    <Text fontSize="sm" color={subtleText}>
                      {t("erp.tasks.fields.statusLabel", {
                        status: statusLabels[quickAddStatus],
                      })}
                    </Text>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.title")}</FormLabel>
                      <Input
                        placeholder={t("erp.tasks.fields.titlePlaceholder")}
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.description")}</FormLabel>
                      <Textarea
                        value={quickAddDescription}
                        onChange={(e) => setQuickAddDescription(e.target.value)}
                        rows={3}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.project")}</FormLabel>
                      <Select
                        placeholder={t("erp.tasks.fields.noProject")}
                        value={quickAddProjectId}
                        onChange={(e) => {
                          setQuickAddProjectId(e.target.value);
                          setQuickAddSubactivityId("");
                        }}
                      >
                        {(projects ?? []).map((project) => (
                          <option key={project.id} value={String(project.id)}>
                            {project.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Subactividad</FormLabel>
                      <Select
                        placeholder="Sin subactividad"
                        value={quickAddSubactivityId}
                        onChange={(e) =>
                          setQuickAddSubactivityId(e.target.value)
                        }
                        isDisabled={!quickAddProjectId}
                      >
                        {(
                          subactivitiesByProject.get(
                            Number(quickAddProjectId),
                          ) ?? []
                        ).map((sub) => (
                          <option key={sub.id} value={String(sub.id)}>
                            {sub.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.assignee")}</FormLabel>
                      <Select
                        placeholder={
                          isSuperAdmin
                            ? t("erp.tasks.fields.selectUser")
                            : t("erp.tasks.fields.tenantUsers")
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
                        <FormLabel>{t("erp.tasks.fields.start")}</FormLabel>
                        <Input
                          type="datetime-local"
                          value={quickAddStartDate}
                          onChange={(e) => setQuickAddStartDate(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t("erp.tasks.fields.end")}</FormLabel>
                        <Input
                          type="datetime-local"
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
                    {t("common.cancel")}
                  </Button>
                  <Button
                    colorScheme="green"
                    onClick={handleQuickAdd}
                    isLoading={quickCreateTaskMutation.isPending}
                  >
                    {t("common.save")}
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
                <ModalHeader>{t("erp.tasks.actions.edit")}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Stack spacing={3}>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.title")}</FormLabel>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.description")}</FormLabel>
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={3}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.status")}</FormLabel>
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
                      <FormLabel>{t("erp.tasks.fields.project")}</FormLabel>
                      <Select
                        placeholder={t("erp.tasks.fields.noProject")}
                        value={editProjectId}
                        onChange={(e) => {
                          setEditProjectId(e.target.value);
                          setEditSubactivityId("");
                        }}
                      >
                        {(projects ?? []).map((project) => (
                          <option key={project.id} value={String(project.id)}>
                            {project.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Subactividad</FormLabel>
                      <Select
                        placeholder="Sin subactividad"
                        value={editSubactivityId}
                        onChange={(e) => setEditSubactivityId(e.target.value)}
                        isDisabled={!editProjectId}
                      >
                        {(
                          subactivitiesByProject.get(Number(editProjectId)) ??
                          []
                        ).map((sub) => (
                          <option key={sub.id} value={String(sub.id)}>
                            {sub.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("erp.tasks.fields.assignee")}</FormLabel>
                      <Select
                        placeholder={
                          isSuperAdmin
                            ? t("erp.tasks.fields.selectUser")
                            : t("erp.tasks.fields.tenantUsers")
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
                        <FormLabel>{t("erp.tasks.fields.start")}</FormLabel>
                        <Input
                          type="datetime-local"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t("erp.tasks.fields.end")}</FormLabel>
                        <Input
                          type="datetime-local"
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
                    {t("common.cancel")}
                  </Button>
                  <Button
                    colorScheme="green"
                    onClick={() => updateTaskMutation.mutate()}
                    isLoading={updateTaskMutation.isPending}
                    isDisabled={!editTaskId || !editTitle.trim()}
                  >
                    {t("erp.tasks.actions.saveChanges")}
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        isOpen={Boolean(viewTask)}
        onClose={() => setViewTask(null)}
        size="lg"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalle de la tarea</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {viewTask && (
              <Stack spacing={3}>
                <Heading size="md">{viewTask.title}</Heading>
                <Text fontSize="sm" color={subtleText}>
                  {viewTask.description?.trim()
                    ? viewTask.description
                    : t("erp.tasks.drawer.noDescription")}
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Proyecto
                    </Text>
                    <Text fontWeight="semibold">
                      {viewTask.project_id
                        ? (projectMap.get(viewTask.project_id) ??
                          t("erp.tasks.summary.noProject"))
                        : t("erp.tasks.summary.noProject")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Subactividad
                    </Text>
                    <Text fontWeight="semibold">
                      {viewTask.subactivity_id
                        ? (subactivities.find(
                            (sub) => sub.id === viewTask.subactivity_id,
                          )?.name ?? viewTask.subactivity_id)
                        : t("erp.tasks.fields.noProject")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.assignee")}
                    </Text>
                    <Text fontWeight="semibold">
                      {viewTask.assigned_to_id
                        ? (userMap.get(viewTask.assigned_to_id) ??
                          viewTask.assigned_to_id)
                        : t("erp.tasks.drawer.unassigned")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.status")}
                    </Text>
                    <Badge
                      colorScheme={kanbanStyles[getTaskStatus(viewTask)].accent}
                      variant="subtle"
                      px={2}
                    >
                      {statusLabels[getTaskStatus(viewTask)]}
                    </Badge>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.start")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(viewTask.start_date)}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.end")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(viewTask.end_date)}
                    </Text>
                  </Box>
                </SimpleGrid>
              </Stack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setViewTask(null)}>
              {t("common.close") || "Cerrar"}
            </Button>
            {viewTask && (
              <>
                <Button
                  variant="outline"
                  colorScheme="green"
                  mr={3}
                  onClick={() => {
                    openEditTask(viewTask);
                    setViewTask(null);
                  }}
                >
                  {t("erp.tasks.actions.edit")}
                </Button>
                <Button
                  colorScheme="red"
                  onClick={() => deleteTaskMutation.mutate(viewTask.id)}
                  isLoading={deleteTaskMutation.isPending}
                >
                  Eliminar
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={createModalOpen} onClose={closeCreateModal} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("erp.tasks.create.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Text fontSize="sm" color={subtleText}>
                {t("erp.tasks.status.pending")}
              </Text>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.title")}</FormLabel>
                <Input
                  placeholder="Escribe el título"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.description")}</FormLabel>
                <Textarea
                  rows={3}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.project")}</FormLabel>
                <Select
                  placeholder={t("erp.tasks.fields.noProject")}
                  value={taskProjectId}
                  onChange={(e) => {
                    setTaskProjectId(e.target.value);
                    setTaskSubactivityId("");
                  }}
                >
                  {(projects ?? []).map((project) => (
                    <option key={project.id} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Subactividad</FormLabel>
                <Select
                  placeholder="Sin subactividad"
                  value={taskSubactivityId}
                  onChange={(e) => setTaskSubactivityId(e.target.value)}
                  isDisabled={!taskProjectId}
                >
                  {(
                    subactivitiesByProject.get(Number(taskProjectId)) ?? []
                  ).map((sub) => (
                    <option key={sub.id} value={String(sub.id)}>
                      {sub.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.assignee")}</FormLabel>
                <Select
                  placeholder={
                    isSuperAdmin
                      ? t("erp.tasks.fields.selectUser")
                      : t("erp.tasks.fields.tenantUsers")
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
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.start")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={taskStartDate}
                    onChange={(e) => setTaskStartDate(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.end")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={taskEndDate}
                    onChange={(e) => setTaskEndDate(e.target.value)}
                  />
                </FormControl>
              </SimpleGrid>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeCreateModal}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="green"
              onClick={handleCreateTask}
              isLoading={createTaskMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Drawer
        isOpen={Boolean(selectedTask)}
        placement="right"
        onClose={() => setSelectedTask(null)}
        size="md"
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>{t("erp.tasks.drawer.title")}</DrawerHeader>
          <DrawerBody>
            {selectedTask ? (
              <Stack spacing={4}>
                <Box>
                  <Heading size="md">{selectedTask.title}</Heading>
                  <Text fontSize="sm" color={subtleText}>
                    {selectedTask.project_id
                      ? t("erp.tasks.drawer.projectLabel", {
                          project:
                            projectMap.get(selectedTask.project_id) ??
                            t("erp.tasks.drawer.projectFallback"),
                        })
                      : t("erp.tasks.drawer.noProject")}
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
                      {t("erp.tasks.drawer.assigned")}
                    </Text>
                    <Text fontWeight="semibold">
                      {selectedTask.assigned_to_id
                        ? (userMap.get(selectedTask.assigned_to_id) ??
                          selectedTask.assigned_to_id)
                        : t("erp.tasks.drawer.unassigned")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.status")}
                    </Text>
                    <Text fontWeight="semibold">
                      {statusLabels[getTaskStatus(selectedTask)]}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.start")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(selectedTask.start_date)}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.end")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(selectedTask.end_date)}
                    </Text>
                  </Box>
                </SimpleGrid>
                <Box>
                  <Text fontSize="xs" color={subtleText}>
                    {t("erp.tasks.fields.description")}
                  </Text>
                  <Text>
                    {selectedTask.description?.trim()
                      ? selectedTask.description
                      : t("erp.tasks.drawer.noDescription")}
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
