// Vista principal de proyectos: creación, resumen, diagrama Gantt y edición detallada.
import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
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
  Switch,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { fetchErpProjects, type ErpProject as ErpProjectApi } from "../api/erpReports";
import { createErpProject, updateErpProject } from "../api/erpManagement";
import { fetchErpTasks, type ErpTask as ErpTaskApi } from "../api/erpTimeTracking";
import {
  createActivity,
  createMilestone,
  createSubActivity,
  fetchActivities,
  fetchMilestones,
  fetchSubActivities,
  updateActivity,
  updateMilestone,
  updateSubActivity,
  type ErpActivity,
  type ErpMilestone,
  type ErpSubActivity,
} from "../api/erpStructure";

type ViewMode = "week" | "month";
type Status = "on-time" | "at-risk" | "overdue" | "planned";

interface ErpTask {
  id: number;
  project_id: number | null;
  name: string;
  start_date: string;
  end_date: string;
  status: "pending" | "in_progress" | "completed";
  progress?: number;
}

interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  type: "task" | "milestone";
  status: Status;
  project?: string;
  projectId?: number;
}

interface ProfessionalGanttProps {
  tasks: GanttTask[];
  viewMode?: ViewMode;
}

// Normaliza fechas ISO (con tiempo) a formato yyyy-MM-dd para inputs type="date".
const toDateInput = (value?: string | null) => (value ? value.split("T")[0] : "");

// Helper simple para ids locales.
const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const ProfessionalGantt: React.FC<ProfessionalGanttProps> = ({
  tasks,
  viewMode = "month",
}) => {
  // Colores dependientes de tema para la tabla y barras.
  const gridBg = useColorModeValue("gray.50", "gray.800");
  const lineColor = useColorModeValue("gray.200", "gray.700");
  const headerBg = useColorModeValue("white", "gray.900");
  const containerBg = useColorModeValue("white", "gray.900");
  const labelColor = useColorModeValue("gray.600", "gray.300");
  const rowBg = useColorModeValue("white", "gray.900");
  const taskTitleColor = useColorModeValue("gray.800", "white");
  const docBg = useColorModeValue("gray.50", "gray.800");
  const docColor = useColorModeValue("gray.600", "gray.200");
  const headerTitleColor = useColorModeValue("gray.700", "gray.100");

  // Calcula rango de fechas a mostrar según las tareas cargadas.
  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 3, 0),
      };
    }

    const allDates = tasks.flatMap((task) => [task.start, task.end]);
    const minDate = new Date(Math.min(...allDates.map((date) => date.getTime())));
    const maxDate = new Date(Math.max(...allDates.map((date) => date.getTime())));

    const paddedStart =
      viewMode === "week"
        ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() - 7)
        : new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const paddedEnd =
      viewMode === "week"
        ? new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate() + 14)
        : new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);

    return { start: paddedStart, end: paddedEnd };
  }, [tasks, viewMode]);

  // Genera columnas de tiempo (días o meses) para el encabezado.
  const timeColumns = useMemo(() => {
    const columns: Date[] = [];
    const current = new Date(dateRange.start);

    if (viewMode === "week") {
      while (current <= dateRange.end) {
        columns.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    } else {
      current.setDate(1);
      while (current <= dateRange.end) {
        columns.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
      }
    }
    return columns;
  }, [dateRange, viewMode]);

  const totalDays =
    (dateRange.end.getTime() - dateRange.start.getTime()) /
    (1000 * 60 * 60 * 24);

  // Posiciona y dimensiona cada barra en porcentaje.
  const getBarStyle = (task: GanttTask) => {
    const startOffset =
      (task.start.getTime() - dateRange.start.getTime()) /
      (1000 * 60 * 60 * 24);
    const duration =
      (task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24);

    const left = (startOffset / totalDays) * 100;
    const width = Math.max((duration / totalDays) * 100, 0.5);

    return { left: `${left}%`, width: `${width}%` };
  };

  // Colores de barra según estado.
  const getStatusColor = (status: Status) => {
    switch (status) {
      case "on-time":
        return "#16a34a";
      case "at-risk":
        return "#f59e0b";
      case "overdue":
        return "#dc2626";
      case "planned":
      default:
        return "#b8c2d1";
    }
  };

  // Línea de hoy en el Gantt.
  const getTodayPosition = () => {
    const today = new Date();
    const offset =
      (today.getTime() - dateRange.start.getTime()) /
      (1000 * 60 * 60 * 24);
    return (offset / totalDays) * 100;
  };

  const formatDate = (date: Date) => {
    if (viewMode === "week") {
      return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    }
    return date.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
  };

  if (tasks.length === 0) {
    return (
      <Box
        p={12}
        textAlign="center"
        bg={gridBg}
        borderRadius="xl"
        border="2px dashed"
        borderColor={lineColor}
      >
        <Heading size="sm" mb={1}>
          No hay tareas para mostrar
        </Heading>
        <Text color="gray.500" fontSize="sm">
          Crea proyectos con fechas para ver el diagrama de Gantt.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      w="100%"
      maxW="100%"
      overflowX="auto"
      borderWidth="1px"
      borderRadius="xl"
      bg={containerBg}
      boxShadow="sm"
    >
      <Box minW="1100px">
        <Flex
          position="sticky"
          top={0}
          zIndex={2}
          bg={headerBg}
          borderBottomWidth="1px"
        >
          <Box
            w="260px"
            px={4}
            py={3}
            fontWeight="semibold"
            fontSize="sm"
            color={headerTitleColor}
            borderRightWidth="1px"
          >
            Tarea
          </Box>
          <Box flex="1" position="relative" h="64px">
            <Flex h="100%">
              {timeColumns.map((date, index) => (
                <Flex
                  key={index}
                  flex="1"
                  px={2}
                  fontSize="xs"
                  color={labelColor}
                  borderLeftWidth={index > 0 ? "1px" : "0"}
                  borderLeftColor={lineColor}
                  align="center"
                  justify="center"
                  textAlign="center"
                  bg={headerBg}
                >
                  {formatDate(date)}
                </Flex>
              ))}
            </Flex>
          </Box>
        </Flex>

        <Box position="relative" bg={rowBg}>
          {tasks.map((task) => (
            <Flex
              key={task.id}
              borderBottomWidth="1px"
              borderColor={lineColor}
              _hover={{ bg: gridBg }}
              transition="background-color 0.15s ease"
            >
              <HStack
                spacing={3}
                w="260px"
                px={4}
                py={3}
                borderRightWidth="1px"
                borderColor={lineColor}
                align="center"
              >
                <Box
                  w="28px"
                  h="28px"
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={lineColor}
                  display="grid"
                  placeItems="center"
                  bg={docBg}
                  color={docColor}
                  fontSize="xs"
                  fontWeight="semibold"
                >
                  Doc
                </Box>
                <Box flex="1" minW={0}>
                  <Text
                    fontSize="sm"
                    fontWeight="semibold"
                    noOfLines={1}
                    color={taskTitleColor}
                  >
                    {task.name}
                  </Text>
                  {task.project && (
                    <Text fontSize="xs" color="gray.500" noOfLines={1}>
                      {task.project}
                    </Text>
                  )}
                </Box>
              </HStack>
              <Box flex="1" position="relative" h="60px">
                <Flex
                  position="absolute"
                  inset={0}
                  bgGradient={`linear(to-r, ${lineColor} 1px, transparent 1px)`}
                  bgSize={`${100 / timeColumns.length}% 100%`}
                  opacity={0.6}
                />
                <Box
                  position="absolute"
                  top="50%"
                  transform="translateY(-50%)"
                  h={task.type === "milestone" ? "20px" : "32px"}
                  borderRadius={task.type === "milestone" ? "full" : "md"}
                  bg={getStatusColor(task.status)}
                  cursor="pointer"
                  boxShadow="md"
                  transition="all 0.15s ease"
                  _hover={{ boxShadow: "lg", transform: "translateY(-50%) scale(1.02)" }}
                  {...getBarStyle(task)}
                >
                  {task.type !== "milestone" && (
                    <>
                      <Box
                        position="absolute"
                        left={0}
                        top={0}
                        bottom={0}
                        w={`${task.progress}%`}
                        bg="rgba(255,255,255,0.35)"
                        borderRadius="md"
                      />
                      <Flex
                        position="absolute"
                        inset={0}
                        align="center"
                        px={2}
                        fontSize="xs"
                        fontWeight="semibold"
                        color="white"
                      >
                        {Math.round(task.progress)}%
                      </Flex>
                    </>
                  )}
                </Box>
              </Box>
            </Flex>
          ))}

          {getTodayPosition() >= 0 && getTodayPosition() <= 100 && (
            <Box
              position="absolute"
              left={`${getTodayPosition()}%`}
              top={0}
              bottom={0}
              w="2px"
              bg="red.500"
              pointerEvents="none"
            >
              <Box
                position="absolute"
                top="-24px"
                left="50%"
                transform="translateX(-50%)"
                bg="red.500"
                color="white"
                px={2}
                py={1}
                borderRadius="md"
                fontSize="xs"
                fontWeight="semibold"
                whiteSpace="nowrap"
              >
                HOY
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// Página principal de proyectos: resumen, listado, Gantt, creación y edición detallada.
export const ErpProjectsPage: React.FC = () => {
  // Tokens de estilo y animación para la cabecera hero.
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const accent = useColorModeValue("green.500", "green.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  // Estado de navegación, filtros y utilidades.
  const [activeTab, setActiveTab] = useState(0);
  const [ganttView, setGanttView] = useState<ViewMode>("week");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const toast = useToast();
  const queryClient = useQueryClient();
  // Formulario de creación de proyectos.
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStart, setProjectStart] = useState("");
  const [projectEnd, setProjectEnd] = useState("");
  const [projectActivities, setProjectActivities] = useState<
    Array<{
      id: string;
      name: string;
      weight: number;
      start: string;
      end: string;
      subactivities: Array<{
        id: string;
        name: string;
        weight: number;
        start: string;
        end: string;
      }>;
    }>
  >([]);
  const [projectMilestones, setProjectMilestones] = useState<
    Array<{ id: string; name: string; start: string; end: string }>
  >([]);
  // Estado del drawer de detalle/edición.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ErpProjectApi | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [activityEdits, setActivityEdits] = useState<
    Record<number, { name: string; start: string; end: string; description: string }>
  >({});
  const [subactivityEdits, setSubactivityEdits] = useState<
    Record<number, { name: string; start: string; end: string; description: string }>
  >({});
  const [milestoneEdits, setMilestoneEdits] = useState<
    Record<number, { title: string; due: string; description: string }>
  >({});

  // Fetch básico: proyectos, tareas, actividades, subactividades e hitos.
  const { data: projects = [] } = useQuery<ErpProjectApi[]>({
    queryKey: ["erp-projects"],
    queryFn: fetchErpProjects,
  });

  const { data: rawTasks = [] } = useQuery<ErpTaskApi[]>({
    queryKey: ["erp-tasks"],
    queryFn: fetchErpTasks,
  });

  const { data: activities = [] } = useQuery<ErpActivity[]>({
    queryKey: ["erp-activities"],
    queryFn: () => fetchActivities(),
  });

  const { data: subactivities = [] } = useQuery<ErpSubActivity[]>({
    queryKey: ["erp-subactivities"],
    queryFn: () => fetchSubActivities(),
  });

  const { data: milestones = [] } = useQuery<ErpMilestone[]>({
    queryKey: ["erp-milestones"],
    queryFn: () => fetchMilestones(),
  });

  // Sincroniza el formulario de edición con el proyecto seleccionado.
  useEffect(() => {
    if (!selectedProject) return;
    setEditName(selectedProject.name ?? "");
    setEditDescription(selectedProject.description ?? "");
    setEditStart(toDateInput(selectedProject.start_date));
    setEditEnd(toDateInput(selectedProject.end_date));
    setEditActive(selectedProject.is_active ?? true);
  }, [selectedProject]);

  // Normaliza tareas para calcular progreso y alimentar métricas.
  const tasks: ErpTask[] = useMemo(
    () => {
      const now = new Date();
      return rawTasks
        .filter((task) => task.start_date && task.end_date)
        .map((task) => {
          const status = task.is_completed
            ? "completed"
            : task.status === "done"
              ? "completed"
              : task.status === "in_progress"
                ? "in_progress"
                : "pending";
          const start = new Date(task.start_date as string);
          const end = new Date(task.end_date as string);
          const durationMs = end.getTime() - start.getTime();
          let progress = 0;
          if (status === "completed") {
            progress = 100;
          } else if (status === "in_progress" && durationMs > 0) {
            const elapsedMs = now.getTime() - start.getTime();
            const ratio = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
            progress = Math.round(ratio * 100);
          }

          return {
            id: task.id,
            project_id: task.project_id ?? null,
            name: task.title,
            start_date: task.start_date ?? "",
            end_date: task.end_date ?? "",
            status,
            progress,
          };
        });
    },
    [rawTasks]
  );
  const totalTasks = rawTasks.length;
  const completedTasks = rawTasks.filter(
    (task) => task.is_completed || task.status === "done" || task.status === "completed"
  ).length;
  // Filtra elementos asociados al proyecto seleccionado para el drawer.
  const selectedProjectActivities = useMemo(
    () => (selectedProject ? activities.filter((act) => act.project_id === selectedProject.id) : []),
    [selectedProject, activities]
  );
  const selectedProjectMilestones = useMemo(
    () => (selectedProject ? milestones.filter((mil) => mil.project_id === selectedProject.id) : []),
    [selectedProject, milestones]
  );
  const selectedProjectTasks = useMemo(
    () => (selectedProject ? rawTasks.filter((task) => task.project_id === selectedProject.id) : []),
    [selectedProject, rawTasks]
  );
  const selectedProjectSubactivities = useMemo(() => {
    if (!selectedProject) return [];
    const activityIds = new Set(selectedProjectActivities.map((a) => a.id));
    return subactivities.filter((sub) => activityIds.has(sub.activity_id));
  }, [selectedProject, selectedProjectActivities, subactivities]);

  // Prepara formularios locales para actividades, subactividades e hitos del proyecto.
  useEffect(() => {
    if (!selectedProject) return;
    const nextActivities: Record<number, { name: string; start: string; end: string; description: string }> = {};
    selectedProjectActivities.forEach((act) => {
      nextActivities[act.id] = {
        name: act.name ?? "",
        start: toDateInput(act.start_date),
        end: toDateInput(act.end_date),
        description: act.description ?? "",
      };
    });
    setActivityEdits(nextActivities);

    const nextSubactivities: Record<
      number,
      { name: string; start: string; end: string; description: string }
    > = {};
    selectedProjectSubactivities.forEach((sub) => {
      nextSubactivities[sub.id] = {
        name: sub.name ?? "",
        start: toDateInput(sub.start_date),
        end: toDateInput(sub.end_date),
        description: sub.description ?? "",
      };
    });
    setSubactivityEdits(nextSubactivities);

    const nextMilestones: Record<number, { title: string; due: string; description: string }> = {};
    selectedProjectMilestones.forEach((mil) => {
      nextMilestones[mil.id] = {
        title: mil.title ?? "",
        due: toDateInput(mil.due_date),
        description: mil.description ?? "",
      };
    });
    setMilestoneEdits(nextMilestones);
  }, [selectedProject, selectedProjectActivities, selectedProjectSubactivities, selectedProjectMilestones]);

  const projectNameMap = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach((project) => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const activityMap = useMemo(() => {
    const map = new Map<number, ErpActivity>();
    activities.forEach((activity) => {
      map.set(activity.id, activity);
    });
    return map;
  }, [activities]);

  const computeProgress = (start: Date, end: Date) => {
    const now = new Date();
    const durationMs = end.getTime() - start.getTime();
    if (now >= end) return 100;
    if (now <= start) return 0;
    if (durationMs <= 0) return 0;
    const elapsedMs = now.getTime() - start.getTime();
    const ratio = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
    return Math.round(ratio * 100);
  };

  // Construye la colección de ítems de Gantt (proyectos, actividades, subactividades, hitos).
  const ganttItems: GanttTask[] = useMemo(() => {
    const items: GanttTask[] = [];
    const now = new Date();

    projects
      .filter((project) => project.start_date && project.end_date)
      .forEach((project) => {
        const start = new Date(project.start_date as string);
        const end = new Date(project.end_date as string);
        const progress = computeProgress(start, end);
        const status: Status =
          now >= end ? "on-time" : now >= start ? "planned" : "planned";
        items.push({
          id: `project-${project.id}`,
          name: project.name,
          start,
          end,
          progress,
          type: "task",
          status,
          project: project.name,
          projectId: project.id,
        });
      });

    activities
      .filter((activity) => activity.start_date && activity.end_date)
      .forEach((activity) => {
        const start = new Date(activity.start_date as string);
        const end = new Date(activity.end_date as string);
        const progress = computeProgress(start, end);
        const status: Status =
          now >= end ? "on-time" : now >= start ? "planned" : "planned";
        items.push({
          id: `activity-${activity.id}`,
          name: activity.name,
          start,
          end,
          progress,
          type: "task",
          status,
          project: projectNameMap.get(activity.project_id),
          projectId: activity.project_id,
        });
      });

    subactivities
      .filter((subactivity) => subactivity.start_date && subactivity.end_date)
      .forEach((subactivity) => {
        const activity = activityMap.get(subactivity.activity_id);
        if (!activity) return;
        const start = new Date(subactivity.start_date as string);
        const end = new Date(subactivity.end_date as string);
        const progress = computeProgress(start, end);
        const status: Status =
          now >= end ? "on-time" : now >= start ? "planned" : "planned";
        items.push({
          id: `subactivity-${subactivity.id}`,
          name: `Sub: ${subactivity.name}`,
          start,
          end,
          progress,
          type: "task",
          status,
          project: projectNameMap.get(activity.project_id),
          projectId: activity.project_id,
        });
      });

    milestones
      .filter((milestone) => milestone.due_date)
      .forEach((milestone) => {
        const due = new Date(milestone.due_date as string);
        const status: Status = now > due ? "on-time" : "planned";
        items.push({
          id: `milestone-${milestone.id}`,
          name: milestone.title,
          start: due,
          end: due,
          progress: 100,
          type: "milestone",
          status,
          project: projectNameMap.get(milestone.project_id),
          projectId: milestone.project_id,
        });
      });

    return items;
  }, [projects, activities, subactivities, milestones, projectNameMap, activityMap]);

  const ganttProjects = projects;

  const ganttTasks: GanttTask[] = useMemo(() => {
    if (selectedProjectId === "all") return ganttItems;
    return ganttItems.filter(
      (item) => item.projectId && String(item.projectId) === selectedProjectId
    );
  }, [selectedProjectId, ganttItems]);

  const handleAddActivity = () => {
    setProjectActivities((prev) => [
      ...prev,
      {
        id: createId(),
        name: `Actividad ${prev.length + 1}`,
        weight: 0,
        start: "",
        end: "",
        subactivities: [],
      },
    ]);
  };

  const handleAddSubactivity = (actId: string) => {
    setProjectActivities((prev) =>
      prev.map((act) =>
        act.id === actId
          ? {
              ...act,
              subactivities: [
                ...act.subactivities,
                {
                  id: createId(),
                  name: `Subactividad ${act.subactivities.length + 1}`,
                  weight: 0,
                  start: "",
                  end: "",
                },
              ],
            }
          : act
      )
    );
  };

  const handleAddMilestone = () => {
    setProjectMilestones((prev) => [
      ...prev,
      { id: createId(), name: `Hito ${prev.length + 1}`, start: "", end: "" },
    ]);
  };

  const openProjectDetails = (project: ErpProjectApi) => {
    setSelectedProject(project);
    setDetailsOpen(true);
  };

  const closeProjectDetails = () => {
    setDetailsOpen(false);
    setSelectedProject(null);
  };

  // Crea proyecto con actividades/subactividades/hitos anidados.
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const project = await createErpProject({
        name: projectName.trim(),
        description: projectDescription.trim() || null,
        start_date: projectStart || null,
        end_date: projectEnd || null,
      });

      for (const activity of projectActivities) {
        const activityDescription =
          activity.weight > 0 ? `Peso: ${activity.weight}%` : null;
        const createdActivity = await createActivity({
          project_id: project.id,
          name: activity.name.trim() || "Actividad",
          description: activityDescription,
          start_date: activity.start || null,
          end_date: activity.end || null,
        });

        for (const subactivity of activity.subactivities) {
          const subDescription =
            subactivity.weight > 0 ? `Peso: ${subactivity.weight}%` : null;
          await createSubActivity({
            activity_id: createdActivity.id,
            name: subactivity.name.trim() || "Subactividad",
            description: subDescription,
            start_date: subactivity.start || null,
            end_date: subactivity.end || null,
          });
        }
      }

      for (const milestone of projectMilestones) {
        const milestoneDescription =
          milestone.start && milestone.end && milestone.start !== milestone.end
            ? `Inicio: ${milestone.start}. Fin: ${milestone.end}.`
            : milestone.start
              ? `Inicio: ${milestone.start}.`
              : milestone.end
                ? `Fin: ${milestone.end}.`
                : null;
        await createMilestone({
          project_id: project.id,
          title: milestone.name.trim() || "Hito",
          due_date: milestone.end || milestone.start || null,
          description: milestoneDescription,
        });
      }

      return project;
    },
    onSuccess: async () => {
      setProjectName("");
      setProjectDescription("");
      setProjectStart("");
      setProjectEnd("");
      setProjectActivities([]);
      setProjectMilestones([]);
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      toast({ title: "Proyecto guardado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar",
        description: error?.response?.data?.detail ?? "No se pudo guardar el proyecto.",
        status: "error",
      });
    },
  });

  // Mutaciones de edición en cascada para actividad, subactividad e hito.
  const updateActivityMutation = useMutation({
    mutationFn: async (input: { id: number; payload: Parameters<typeof updateActivity>[1] }) =>
      updateActivity(input.id, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-activities"] });
      toast({ title: "Actividad actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar actividad",
        description: error?.response?.data?.detail ?? "No se pudo actualizar la actividad.",
        status: "error",
      });
    },
  });

  const updateSubActivityMutation = useMutation({
    mutationFn: async (input: { id: number; payload: Parameters<typeof updateSubActivity>[1] }) =>
      updateSubActivity(input.id, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-subactivities"] });
      toast({ title: "Subactividad actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar subactividad",
        description: error?.response?.data?.detail ?? "No se pudo actualizar la subactividad.",
        status: "error",
      });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async (input: { id: number; payload: Parameters<typeof updateMilestone>[1] }) =>
      updateMilestone(input.id, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-milestones"] });
      toast({ title: "Hito actualizado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar hito",
        description: error?.response?.data?.detail ?? "No se pudo actualizar el hito.",
        status: "error",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("No hay proyecto seleccionado");
      }
      return updateErpProject(selectedProject.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        start_date: editStart || null,
        end_date: editEnd || null,
        is_active: editActive,
      });
    },
    onSuccess: async (project) => {
      setSelectedProject(project);
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      toast({ title: "Proyecto actualizado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar",
        description: error?.response?.data?.detail ?? "No se pudo actualizar el proyecto.",
        status: "error",
      });
    },
  });

  const handleSaveProject = () => {
    if (!projectName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    createProjectMutation.mutate();
  };

  // Guarda edición del proyecto actual.
  const handleUpdateProject = () => {
    if (!selectedProject) {
      toast({ title: "Selecciona un proyecto", status: "warning" });
      return;
    }
    if (!editName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    updateProjectMutation.mutate();
  };

  const handleUpdateActivity = (id: number) => {
    const form = activityEdits[id];
    if (!form) return;
    updateActivityMutation.mutate({
      id,
      payload: {
        name: form.name.trim() || "Actividad",
        description: form.description.trim() || null,
        start_date: form.start || null,
        end_date: form.end || null,
      },
    });
  };

  const handleUpdateSubactivity = (id: number) => {
    const form = subactivityEdits[id];
    if (!form) return;
    updateSubActivityMutation.mutate({
      id,
      payload: {
        name: form.name.trim() || "Subactividad",
        description: form.description.trim() || null,
        start_date: form.start || null,
        end_date: form.end || null,
      },
    });
  };

  const handleUpdateMilestone = (id: number) => {
    const form = milestoneEdits[id];
    if (!form) return;
    updateMilestoneMutation.mutate({
      id,
      payload: {
        title: form.title.trim() || "Hito",
        description: form.description.trim() || null,
        due_date: form.due || null,
      },
    });
  };

  const heroItems = [
    { label: "Proyectos activos", value: projects.length },
    { label: "Total tareas", value: totalTasks },
    {
      label: "Completadas",
      value: completedTasks,
    },
  ];

  // Render principal.
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
        mb={6}
      >
        <Box
          position="absolute"
          inset="0"
          opacity={0.16}
          bgImage="radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4), transparent 55%)"
        />
        <Stack position="relative" spacing={4}>
          <Stack spacing={1}>
            <Heading size="lg">Gestión de Proyectos</Heading>
            <Text color="whiteAlpha.800">
              Control y visualización de proyectos y tareas
            </Text>
          </Stack>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {heroItems.map((item) => (
              <Box key={item.label} p={4} borderRadius="lg" bg="whiteAlpha.100">
                <Text fontSize="xs" textTransform="uppercase" color="whiteAlpha.800">
                  {item.label}
                </Text>
                <Heading size="md" mt={1}>
                  {item.value}
                </Heading>
              </Box>
            ))}
          </SimpleGrid>
        </Stack>
      </Box>

      {/* Navegación por pestañas: resumen, tarjetas, Gantt y creación */}
      <Tabs variant="line" colorScheme="green" isLazy index={activeTab} onChange={setActiveTab}>
          <TabList borderBottomWidth="1px">
            <Tab>Resumen</Tab>
            <Tab>Proyectos</Tab>
            <Tab>Diagrama de Gantt</Tab>
            <Tab>Crear</Tab>
          </TabList>
          <TabPanels mt={4}>
          {/* Resumen rápido de proyectos en tarjetas simples */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {projects.map((project) => (
                <Box key={project.id} borderWidth="1px" borderRadius="lg" p={4} bg={cardBg}>
                  <Heading size="sm" mb={1}>
                    {project.name}
                  </Heading>
                  <Text fontSize="sm" color={subtleText} mb={2}>
                    {project.description}
                  </Text>
                  <HStack spacing={2} fontSize="xs" color={subtleText}>
                    <Badge colorScheme="gray">📅</Badge>
                    <Text>
                      {project.start_date} — {project.end_date}
                    </Text>
                  </HStack>
                </Box>
              ))}
            </SimpleGrid>
          </TabPanel>

          {/* Listado detallado por proyecto con botón de edición */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {projects.map((project) => (
                <Box key={project.id} borderWidth="1px" borderRadius="lg" p={4} bg={cardBg}>
                  <Flex justify="space-between" align="flex-start" mb={2}>
                    <Heading size="sm">{project.name}</Heading>
                    <Badge colorScheme={project.is_active === false ? "red" : "green"}>
                      {project.is_active === false ? "Inactivo" : "Activo"}
                    </Badge>
                  </Flex>
                  <Text fontSize="sm" color={subtleText} mb={3}>
                    {project.description || "Sin descripcion"}
                  </Text>
                  <Stack fontSize="xs" color={subtleText} spacing={1} mb={3}>
                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Fechas</Badge>
                      <Text>
                        {project.start_date || "Sin inicio"} — {project.end_date || "Sin fin"}
                      </Text>
                    </HStack>
                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Actividades</Badge>
                      <Text>{activities.filter((a) => a.project_id === project.id).length}</Text>
                    </HStack>
                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Hitos</Badge>
                      <Text>{milestones.filter((m) => m.project_id === project.id).length}</Text>
                    </HStack>
                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Tareas</Badge>
                      <Text>{rawTasks.filter((t) => t.project_id === project.id).length}</Text>
                    </HStack>
                  </Stack>
                  <Button size="sm" colorScheme="green" onClick={() => openProjectDetails(project)}>
                    Ver detalle y editar
                  </Button>
                </Box>
              ))}
            </SimpleGrid>
          </TabPanel>

          {/* Diagrama Gantt filtrable y con selector de vista */}
          <TabPanel px={0}>
            <Stack spacing={4}>
              <HStack spacing={3} align="flex-end" flexWrap="wrap">
                <FormControl minW="200px" maxW="260px">
                  <FormLabel fontSize="sm">Proyecto</FormLabel>
                  <Select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    size="sm"
                  >
                    <option value="all">Todos los proyectos</option>
                    {ganttProjects.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <HStack
                  spacing={2}
                  borderWidth="1px"
                  borderRadius="md"
                  p={1}
                  bg={panelBg}
                >
                  <Button
                    size="sm"
                    variant={ganttView === "week" ? "solid" : "ghost"}
                    colorScheme="green"
                    onClick={() => setGanttView("week")}
                  >
                    Semana
                  </Button>
                  <Button
                    size="sm"
                    variant={ganttView === "month" ? "solid" : "ghost"}
                    colorScheme="green"
                    onClick={() => setGanttView("month")}
                  >
                    Mes
                  </Button>
                </HStack>
                <HStack spacing={4} ml="auto" fontSize="sm" color={subtleText} flexWrap="wrap">
                  <HStack spacing={1}>
                    <Box w={4} h={4} borderRadius="md" bg="green.500" />
                    <Text>A tiempo</Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Box w={4} h={4} borderRadius="md" bg="orange.400" />
                    <Text>En riesgo</Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Box w={4} h={4} borderRadius="md" bg="red.500" />
                    <Text>Retrasado</Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Box w={4} h={4} borderRadius="md" bg="#b8c2d1" />
                    <Text>Planificado</Text>
                  </HStack>
                </HStack>
              </HStack>

              <ProfessionalGantt tasks={ganttTasks} viewMode={ganttView} />
            </Stack>
          </TabPanel>

          {/* Alta de proyecto con actividades, subactividades e hitos locales */}
          <TabPanel px={0}>
            <Stack spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Nombre del proyecto</FormLabel>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel>Descripción</FormLabel>
                  <Input
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Inicio</FormLabel>
                  <Input
                    type="date"
                    value={projectStart}
                    onChange={(e) => setProjectStart(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Fin</FormLabel>
                  <Input type="date" value={projectEnd} onChange={(e) => setProjectEnd(e.target.value)} />
                </FormControl>
              </SimpleGrid>

              <Flex justify="space-between" align="center">
                <Heading size="sm">Actividades</Heading>
                <Button size="sm" onClick={handleAddActivity}>
                  + Añadir actividad
                </Button>
              </Flex>
              <Stack spacing={3}>
                {projectActivities.length === 0 && (
                  <Text fontSize="sm" color={subtleText}>
                    Añade actividades con peso y fechas.
                  </Text>
                )}
                {projectActivities.map((act, idx) => (
                  <Box key={act.id} borderWidth="1px" borderRadius="md" p={3} bg={cardBg}>
                    <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3}>
                      <FormControl>
                        <FormLabel fontSize="sm">Actividad #{idx + 1}</FormLabel>
                        <Input
                          value={act.name}
                          onChange={(e) =>
                            setProjectActivities((prev) =>
                              prev.map((item) =>
                                item.id === act.id ? { ...item, name: e.target.value } : item
                              )
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Peso %</FormLabel>
                        <Input
                          type="number"
                          value={act.weight}
                          onChange={(e) =>
                            setProjectActivities((prev) =>
                              prev.map((item) =>
                                item.id === act.id
                                  ? { ...item, weight: Number(e.target.value) }
                                  : item
                              )
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Inicio</FormLabel>
                        <Input
                          type="date"
                          value={act.start}
                          onChange={(e) =>
                            setProjectActivities((prev) =>
                              prev.map((item) =>
                                item.id === act.id ? { ...item, start: e.target.value } : item
                              )
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Fin</FormLabel>
                        <Input
                          type="date"
                          value={act.end}
                          onChange={(e) =>
                            setProjectActivities((prev) =>
                              prev.map((item) =>
                                item.id === act.id ? { ...item, end: e.target.value } : item
                              )
                            )
                          }
                        />
                      </FormControl>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        alignSelf="flex-end"
                        onClick={() =>
                          setProjectActivities((prev) => prev.filter((item) => item.id !== act.id))
                        }
                      >
                        Eliminar
                      </Button>
                    </SimpleGrid>

                    <Button size="xs" mt={2} onClick={() => handleAddSubactivity(act.id)}>
                      + Añadir subactividad
                    </Button>
                    <Stack mt={2} spacing={2}>
                      {act.subactivities.length === 0 ? (
                        <Text fontSize="xs" color={subtleText}>
                          Sin subactividades.
                        </Text>
                      ) : (
                        act.subactivities.map((sub, sidx) => (
                          <SimpleGrid
                            key={sub.id}
                            columns={{ base: 1, md: 4 }}
                            spacing={2}
                            alignItems="center"
                          >
                            <FormControl>
                              <FormLabel fontSize="xs">Subactividad #{sidx + 1}</FormLabel>
                              <Input
                                value={sub.name}
                                onChange={(e) =>
                                  setProjectActivities((prev) =>
                                    prev.map((item) =>
                                      item.id === act.id
                                        ? {
                                            ...item,
                                            subactivities: item.subactivities.map((s) =>
                                              s.id === sub.id ? { ...s, name: e.target.value } : s
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Peso %</FormLabel>
                              <Input
                                type="number"
                                value={sub.weight}
                                onChange={(e) =>
                                  setProjectActivities((prev) =>
                                    prev.map((item) =>
                                      item.id === act.id
                                        ? {
                                            ...item,
                                            subactivities: item.subactivities.map((s) =>
                                              s.id === sub.id
                                                ? { ...s, weight: Number(e.target.value) }
                                                : s
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Inicio</FormLabel>
                              <Input
                                type="date"
                                value={sub.start}
                                onChange={(e) =>
                                  setProjectActivities((prev) =>
                                    prev.map((item) =>
                                      item.id === act.id
                                        ? {
                                            ...item,
                                            subactivities: item.subactivities.map((s) =>
                                              s.id === sub.id
                                                ? { ...s, start: e.target.value }
                                                : s
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Fin</FormLabel>
                              <Input
                                type="date"
                                value={sub.end}
                                onChange={(e) =>
                                  setProjectActivities((prev) =>
                                    prev.map((item) =>
                                      item.id === act.id
                                        ? {
                                            ...item,
                                            subactivities: item.subactivities.map((s) =>
                                              s.id === sub.id
                                                ? { ...s, end: e.target.value }
                                                : s
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                              />
                            </FormControl>
                          </SimpleGrid>
                        ))
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>

              <Flex justify="space-between" align="center">
                <Heading size="sm">Hitos</Heading>
                <Button size="sm" onClick={handleAddMilestone}>
                  + Añadir hito
                </Button>
              </Flex>
              <Stack spacing={3}>
                {projectMilestones.length === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    Añade hitos con fechas.
                  </Text>
                ) : (
                  projectMilestones.map((mil, idx) => (
                    <SimpleGrid key={mil.id} columns={{ base: 1, md: 4 }} spacing={3}>
                      <FormControl>
                        <FormLabel fontSize="sm">Hito #{idx + 1}</FormLabel>
                        <Input
                          value={mil.name}
                          onChange={(e) =>
                            setProjectMilestones((prev) =>
                              prev.map((m) => (m.id === mil.id ? { ...m, name: e.target.value } : m))
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Inicio</FormLabel>
                        <Input
                          type="date"
                          value={mil.start}
                          onChange={(e) =>
                            setProjectMilestones((prev) =>
                              prev.map((m) => (m.id === mil.id ? { ...m, start: e.target.value } : m))
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Fin</FormLabel>
                        <Input
                          type="date"
                          value={mil.end}
                          onChange={(e) =>
                            setProjectMilestones((prev) =>
                              prev.map((m) => (m.id === mil.id ? { ...m, end: e.target.value } : m))
                            )
                          }
                        />
                      </FormControl>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        alignSelf="flex-end"
                        onClick={() =>
                          setProjectMilestones((prev) => prev.filter((m) => m.id !== mil.id))
                        }
                      >
                        Eliminar
                      </Button>
                    </SimpleGrid>
                  ))
                )}
              </Stack>

              <Button
                alignSelf="flex-start"
                colorScheme="green"
                onClick={handleSaveProject}
                isLoading={createProjectMutation.isPending}
              >
                Guardar proyecto
              </Button>
            </Stack>
          </TabPanel>
        </TabPanels>
      </Tabs>
      {/* Drawer de detalle/edición del proyecto seleccionado */}
      <Drawer isOpen={detailsOpen} placement="right" onClose={closeProjectDetails} size="xl">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader borderBottomWidth="1px">
            {selectedProject ? `Proyecto: ${selectedProject.name}` : "Proyecto"}
          </DrawerHeader>
          <DrawerBody>
            {selectedProject ? (
              <Stack spacing={4}>
                <Stack spacing={1} fontSize="sm" color={subtleText}>
                  <Text>ID: {selectedProject.id}</Text>
                  {selectedProject.created_at && <Text>Creado: {selectedProject.created_at}</Text>}
                </Stack>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontSize="xs" color={subtleText}>
                      Inicio
                    </Text>
                    <Text fontWeight="semibold">
                      {selectedProject.start_date || "Sin inicio"}
                    </Text>
                  </Box>
                  <Box borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontSize="xs" color={subtleText}>
                      Fin
                    </Text>
                    <Text fontWeight="semibold">{selectedProject.end_date || "Sin fin"}</Text>
                  </Box>
                  <Box borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontSize="xs" color={subtleText}>
                      Actividades
                    </Text>
                    <Text fontWeight="semibold">{selectedProjectActivities.length}</Text>
                  </Box>
                  <Box borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontSize="xs" color={subtleText}>
                      Hitos
                    </Text>
                    <Text fontWeight="semibold">{selectedProjectMilestones.length}</Text>
                  </Box>
                </SimpleGrid>

                <Divider />

                <Heading size="sm">Editar datos</Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <FormControl isRequired>
                    <FormLabel>Nombre</FormLabel>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Activo</FormLabel>
                    <Switch
                      isChecked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      colorScheme="green"
                    />
                  </FormControl>
                  <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                    <FormLabel>Descripcion</FormLabel>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Inicio</FormLabel>
                    <Input
                      type="date"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Fin</FormLabel>
                    <Input
                      type="date"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>

                <Divider />

                <Heading size="sm">Actividades</Heading>
                <Stack spacing={3}>
                  {selectedProjectActivities.length === 0 ? (
                    <Text fontSize="sm" color={subtleText}>
                      Sin actividades vinculadas.
                    </Text>
                  ) : (
                    selectedProjectActivities.map((act) => {
                      const form = activityEdits[act.id] || {
                        name: "",
                        start: "",
                        end: "",
                        description: "",
                      };
                      return (
                        <Box key={act.id} borderWidth="1px" borderRadius="md" p={3}>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                            <FormControl>
                              <FormLabel fontSize="xs">Nombre</FormLabel>
                              <Input
                                value={form.name}
                                onChange={(e) =>
                                  setActivityEdits((prev) => ({
                                    ...prev,
                                    [act.id]: { ...form, name: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Descripcion</FormLabel>
                              <Input
                                value={form.description}
                                onChange={(e) =>
                                  setActivityEdits((prev) => ({
                                    ...prev,
                                    [act.id]: { ...form, description: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Inicio</FormLabel>
                              <Input
                                type="date"
                                value={form.start}
                                onChange={(e) =>
                                  setActivityEdits((prev) => ({
                                    ...prev,
                                    [act.id]: { ...form, start: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Fin</FormLabel>
                              <Input
                                type="date"
                                value={form.end}
                                onChange={(e) =>
                                  setActivityEdits((prev) => ({
                                    ...prev,
                                    [act.id]: { ...form, end: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                          </SimpleGrid>
                          <HStack justify="space-between">
                            <Text fontSize="xs" color={subtleText}>
                              Subactividades:{" "}
                              {selectedProjectSubactivities.filter(
                                (sub) => sub.activity_id === act.id
                              ).length}
                            </Text>
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleUpdateActivity(act.id)}
                              isLoading={updateActivityMutation.isPending}
                            >
                              Guardar actividad
                            </Button>
                          </HStack>
                        </Box>
                      );
                    })
                  )}
                </Stack>

                <Heading size="sm">Subactividades</Heading>
                <Stack spacing={3}>
                  {selectedProjectSubactivities.length === 0 ? (
                    <Text fontSize="sm" color={subtleText}>
                      Sin subactividades.
                    </Text>
                  ) : (
                    selectedProjectSubactivities.map((sub) => {
                      const form = subactivityEdits[sub.id] || {
                        name: "",
                        start: "",
                        end: "",
                        description: "",
                      };
                      const parentActivity = selectedProjectActivities.find(
                        (act) => act.id === sub.activity_id
                      );
                      return (
                        <Box key={sub.id} borderWidth="1px" borderRadius="md" p={3}>
                          <Text fontSize="xs" color={subtleText} mb={1}>
                            Actividad: {parentActivity?.name ?? "-"}
                          </Text>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                            <FormControl>
                              <FormLabel fontSize="xs">Nombre</FormLabel>
                              <Input
                                value={form.name}
                                onChange={(e) =>
                                  setSubactivityEdits((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...form, name: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Descripcion</FormLabel>
                              <Input
                                value={form.description}
                                onChange={(e) =>
                                  setSubactivityEdits((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...form, description: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Inicio</FormLabel>
                              <Input
                                type="date"
                                value={form.start}
                                onChange={(e) =>
                                  setSubactivityEdits((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...form, start: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Fin</FormLabel>
                              <Input
                                type="date"
                                value={form.end}
                                onChange={(e) =>
                                  setSubactivityEdits((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...form, end: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                          </SimpleGrid>
                          <Flex justify="flex-end">
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleUpdateSubactivity(sub.id)}
                              isLoading={updateSubActivityMutation.isPending}
                            >
                              Guardar subactividad
                            </Button>
                          </Flex>
                        </Box>
                      );
                    })
                  )}
                </Stack>

                <Heading size="sm">Hitos</Heading>
                <Stack spacing={3}>
                  {selectedProjectMilestones.length === 0 ? (
                    <Text fontSize="sm" color={subtleText}>
                      Sin hitos.
                    </Text>
                  ) : (
                    selectedProjectMilestones.map((milestone) => {
                      const form = milestoneEdits[milestone.id] || {
                        title: "",
                        due: "",
                        description: "",
                      };
                      return (
                        <Box key={milestone.id} borderWidth="1px" borderRadius="md" p={3}>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                            <FormControl>
                              <FormLabel fontSize="xs">Titulo</FormLabel>
                              <Input
                                value={form.title}
                                onChange={(e) =>
                                  setMilestoneEdits((prev) => ({
                                    ...prev,
                                    [milestone.id]: { ...form, title: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Descripcion</FormLabel>
                              <Input
                                value={form.description}
                                onChange={(e) =>
                                  setMilestoneEdits((prev) => ({
                                    ...prev,
                                    [milestone.id]: { ...form, description: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Fecha</FormLabel>
                              <Input
                                type="date"
                                value={form.due}
                                onChange={(e) =>
                                  setMilestoneEdits((prev) => ({
                                    ...prev,
                                    [milestone.id]: { ...form, due: e.target.value },
                                  }))
                                }
                              />
                            </FormControl>
                          </SimpleGrid>
                          <Flex justify="flex-end">
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleUpdateMilestone(milestone.id)}
                              isLoading={updateMilestoneMutation.isPending}
                            >
                              Guardar hito
                            </Button>
                          </Flex>
                        </Box>
                      );
                    })
                  )}
                </Stack>

                <Heading size="sm">Tareas</Heading>
                <Stack spacing={3}>
                  {selectedProjectTasks.length === 0 ? (
                    <Text fontSize="sm" color={subtleText}>
                      Sin tareas.
                    </Text>
                  ) : (
                    selectedProjectTasks.map((task) => (
                      <Box key={task.id} borderWidth="1px" borderRadius="md" p={3}>
                        <Flex justify="space-between" align="center" mb={1}>
                          <Text fontWeight="semibold">{task.title}</Text>
                          <Badge colorScheme={task.is_completed ? "green" : "yellow"}>
                            {task.status || (task.is_completed ? "completed" : "pendiente")}
                          </Badge>
                        </Flex>
                        <Text fontSize="xs" color={subtleText}>
                          {task.start_date || "Sin inicio"} — {task.end_date || "Sin fin"}
                        </Text>
                        {task.description && (
                          <Text mt={1} fontSize="xs" color={subtleText}>
                            {task.description}
                          </Text>
                        )}
                      </Box>
                    ))
                  )}
                </Stack>
              </Stack>
            ) : (
              <Text fontSize="sm" color={subtleText}>
                Selecciona un proyecto para ver los detalles.
              </Text>
            )}
          </DrawerBody>
          <DrawerFooter borderTopWidth="1px">
            <Button variant="ghost" mr={3} onClick={closeProjectDetails}>
              Cerrar
            </Button>
            <Button
              colorScheme="green"
              onClick={handleUpdateProject}
              isLoading={updateProjectMutation.isPending}
              isDisabled={!selectedProject}
            >
              Guardar cambios
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </AppShell>
  );
};

export default ErpProjectsPage;
