import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
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
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";

import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import { createErpProject } from "../api/erpManagement";
import { fetchErpTasks, type ErpTask } from "../api/erpTimeTracking";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";

// Cabecera personalizada del listado del Gantt (espanol).
const GanttTaskListHeader: React.FC<{
  headerHeight: number;
  fontFamily: string;
  fontSize: string;
  rowWidth: string;
}> = ({ headerHeight, fontFamily, fontSize, rowWidth }) => (
  <div
    style={{
      fontFamily,
      fontSize,
      borderBottom: "1px solid rgba(0,0,0,0.08)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: headerHeight - 2,
      }}
    >
      {["Nombre", "Desde", "Hasta"].map((label, index) => (
        <div
          key={label}
          style={{
            minWidth: rowWidth,
            paddingLeft: 8,
            paddingRight: 8,
            borderRight:
              index < 2 ? "1px solid rgba(0,0,0,0.08)" : "none",
            fontWeight: 600,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  </div>
);

// Pantalla de proyectos: listado, creacion y Gantt.
export const ErpProjectsPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const accent = useColorModeValue("brand.500", "brand.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  // Estado del formulario de creacion de proyectos y vista Gantt.
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectEndDate, setProjectEndDate] = useState("");
  const [ganttView, setGanttView] = useState<ViewMode>(ViewMode.Week);

  // Determina permisos del usuario actual.
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const isTenantAdmin = Boolean(currentUser?.role_id) && !isSuperAdmin;

  // Datos principales: proyectos y tareas del ERP.
  // Queries: proyectos y tareas para KPIs y Gantt.
  const { data: projects, isLoading, error } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects"],
    queryFn: fetchErpProjects,
  });

  // Tareas para calcular progreso y cargar barras del Gantt.
  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: ["erp-tasks"],
    queryFn: fetchErpTasks,
  });

  // KPIs del resumen.
  const projectCount = projects?.length ?? 0;
  const taskCount = tasks?.length ?? 0;
  const assignedCount = tasks?.filter((task) => task.assigned_to_id).length ?? 0;
  const canManageProjects = isSuperAdmin || isTenantAdmin;

  // Mutacion para crear proyectos.
  // Persistencia de nuevo proyecto en backend.
  const createProjectMutation = useMutation({
    mutationFn: () =>
      createErpProject({
        name: projectName.trim(),
        description: projectDescription.trim() || null,
        start_date: projectStartDate || null,
        end_date: projectEndDate || null,
      }),
    onSuccess: async () => {
      setProjectName("");
      setProjectDescription("");
      setProjectStartDate("");
      setProjectEndDate("");
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      toast({ title: "Proyecto creado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo crear el proyecto",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  // Validacion y envio del formulario de proyecto.
  const handleCreateProject = () => {
    if (!projectName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    createProjectMutation.mutate();
  };

  // Normaliza el estado de tarea para el Gantt.
  const getTaskStatus = (task: ErpTask): "pending" | "in_progress" | "done" => {
    const raw = task.status?.toLowerCase();
    if (raw === "pending" || raw === "in_progress" || raw === "done") {
      return raw;
    }
    return task.is_completed ? "done" : "pending";
  };

  // Convierte fecha en Date valido, con fallback seguro.
  const parseDateOrFallback = (value?: string | null, fallback?: Date): Date => {
    if (value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback ?? new Date();
  };

  // Mapea proyectos y tareas al formato del componente Gantt.
  // Construye la lista de barras para el componente Gantt.
  const ganttTasks = useMemo(() => {
    const taskEntries: GanttTask[] = (tasks ?? []).map((task) => {
      const start = parseDateOrFallback(task.start_date, new Date());
      const end = parseDateOrFallback(
        task.end_date,
        new Date(start.getTime() + 24 * 60 * 60 * 1000),
      );
      return {
        id: `task-${task.id}`,
        name: task.title,
        start,
        end,
        type: "task",
        progress: getTaskStatus(task) === "done" ? 100 : 0,
        project: task.project_id ? `project-${task.project_id}` : undefined,
        dependencies: [],
      };
    });

    const projectEntries: GanttTask[] = (projects ?? []).map((project) => {
      const projectTasks = taskEntries.filter(
        (entry) => entry.project === `project-${project.id}`,
      );
      const taskStarts = projectTasks.map((entry) => entry.start.getTime());
      const taskEnds = projectTasks.map((entry) => entry.end.getTime());
      const defaultStart = parseDateOrFallback(project.start_date, new Date());
      const defaultEnd = parseDateOrFallback(
        project.end_date,
        new Date(defaultStart.getTime() + 7 * 24 * 60 * 60 * 1000),
      );
      const start =
        taskStarts.length > 0
          ? new Date(Math.min(...taskStarts))
          : defaultStart;
      const end = taskEnds.length > 0 ? new Date(Math.max(...taskEnds)) : defaultEnd;
      return {
        id: `project-${project.id}`,
        name: project.name,
        start,
        end,
        type: "project",
        progress:
          projectTasks.length === 0
            ? 0
            : Math.round(
                (projectTasks.filter((entry) => entry.progress === 100).length /
                  projectTasks.length) *
                  100,
              ),
        dependencies: [],
      };
    });

    return [...projectEntries, ...taskEntries];
  }, [projects, tasks]);

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
          <Heading size="lg">Gestiona proyectos y fechas clave</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Centraliza proyectos, define fechas y revisa el avance global.
          </Text>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} pt={2}>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                Proyectos activos
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {projectCount}
              </Text>
            </Box>
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
          <Tab>Proyectos</Tab>
          <Tab>Crear</Tab>
          <Tab>Gantt</Tab>
        </TabList>
        <TabPanels mt={6}>
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <Box
                as={Link}
                to="/erp/projects"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
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
                to="/erp/tasks"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                  Tareas
                </Text>
                <Heading size="sm" mb={1}>
                  Kanban de tareas
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  Organiza trabajo diario y mueve prioridades.
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
                <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                  Analitica
                </Text>
                <Heading size="sm" mb={1}>
                  Informe de horas
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  Analiza productividad por proyecto y usuario.
                </Text>
              </Box>
            </SimpleGrid>
          </TabPanel>
          <TabPanel px={0}>
            <Stack spacing={4}>
              <Heading size="md">Proyectos activos</Heading>
              {isLoading && <Text>Cargando proyectos...</Text>}
              {error && (
                <Text color="red.400">
                  No se pudieron cargar los proyectos del ERP.
                </Text>
              )}
              {!isLoading && !error && projects && (
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                  {projects.map((project) => (
                    <Box
                      key={project.id}
                      borderWidth="1px"
                      borderRadius="xl"
                      p={4}
                      bg={cardBg}
                      position="relative"
                      _hover={{ borderColor: accent, shadow: "md" }}
                    >
                      <Box
                        position="absolute"
                        top={3}
                        right={3}
                        px={2}
                        py={1}
                        borderRadius="full"
                        fontSize="xs"
                        bg="rgba(15, 61, 46, 0.08)"
                        color={subtleText}
                      >
                        #{project.id}
                      </Box>
                      <Heading size="sm" mb={2}>
                        {project.name}
                      </Heading>
                      <Stack spacing={2}>
                        {project.description && (
                          <Text fontSize="sm" color={subtleText} noOfLines={2}>
                            {project.description}
                          </Text>
                        )}
                        <Stack
                          direction="row"
                          spacing={2}
                          align="center"
                          flexWrap="wrap"
                        >
                          <Box
                            px={2}
                            py={1}
                            borderRadius="full"
                            fontSize="xs"
                            bg="rgba(0, 102, 43, 0.12)"
                            color={subtleText}
                          >
                            {project.start_date ?? "Sin inicio"}
                          </Box>
                          <Text fontSize="xs" color={subtleText}>
                            a
                          </Text>
                          <Box
                            px={2}
                            py={1}
                            borderRadius="full"
                            fontSize="xs"
                            bg="rgba(202, 168, 91, 0.18)"
                            color={subtleText}
                          >
                            {project.end_date ?? "Sin fin"}
                          </Box>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </TabPanel>
          <TabPanel px={0}>
            {canManageProjects ? (
              <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg} maxW="640px">
                <Heading size="sm" mb={4}>
                  Crear proyecto
                </Heading>
                <Stack spacing={3}>
                  <FormControl>
                    <FormLabel>Nombre del proyecto</FormLabel>
                    <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Descripcion</FormLabel>
                    <Textarea
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      rows={3}
                    />
                  </FormControl>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>Inicio</FormLabel>
                      <Input
                        type="date"
                        value={projectStartDate}
                        onChange={(e) => setProjectStartDate(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Fin</FormLabel>
                      <Input
                        type="date"
                        value={projectEndDate}
                        onChange={(e) => setProjectEndDate(e.target.value)}
                      />
                    </FormControl>
                  </SimpleGrid>
                  <Button
                    colorScheme="green"
                    onClick={handleCreateProject}
                    isLoading={createProjectMutation.isPending}
                    alignSelf="flex-start"
                  >
                    Crear proyecto
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Text fontSize="sm" color={subtleText}>
                No tienes permisos para crear proyectos.
              </Text>
            )}
          </TabPanel>
          <TabPanel px={0}>
            <Heading size="md" mb={4}>
              Diagrama de Gantt
            </Heading>
            <Box
              borderWidth="1px"
              borderRadius="xl"
              bg={cardBg}
              p={4}
              sx={{
                ".today rect": {
                  fill: "#dc2626",
                  opacity: 0.9,
                  width: "1px",
                },
              }}
            >
              <Stack direction={{ base: "column", md: "row" }} justify="space-between" mb={4}>
                <Text fontSize="sm" color={subtleText}>
                  Visualiza proyectos y tareas con sus fechas clave.
                </Text>
                <Tabs
                  variant="soft-rounded"
                  colorScheme="green"
                  onChange={(index) => {
                    const modes = [ViewMode.Week, ViewMode.Month];
                    setGanttView(modes[index] ?? ViewMode.Week);
                  }}
                >
                  <TabList>
                    <Tab>Semana</Tab>
                    <Tab>Mes</Tab>
                  </TabList>
                </Tabs>
              </Stack>
              {ganttTasks.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  No hay tareas con fechas para mostrar.
                </Text>
              ) : (
                <Gantt
                  tasks={ganttTasks}
                  viewMode={ganttView}
                  listCellWidth="200px"
                  columnWidth={ganttView === ViewMode.Month ? 140 : 110}
                  rowHeight={42}
                  barCornerRadius={2}
                  todayColor="transparent"
                  locale="es"
                  TaskListHeader={GanttTaskListHeader}
                />
              )}
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </AppShell>
  );
};
