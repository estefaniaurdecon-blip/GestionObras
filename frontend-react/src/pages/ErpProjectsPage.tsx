import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
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
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

import { AppShell } from "../components/layout/AppShell";

type ViewMode = "week" | "month";
type Status = "on-time" | "at-risk" | "overdue" | "planned";

interface ErpProject {
  id: number;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}

interface ErpTask {
  id: number;
  project_id: number;
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
}

interface ProfessionalGanttProps {
  tasks: GanttTask[];
  viewMode?: ViewMode;
}

// Helper simple para ids locales.
const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const ProfessionalGantt: React.FC<ProfessionalGanttProps> = ({
  tasks,
  viewMode = "month",
}) => {
  const gridBg = useColorModeValue("gray.50", "gray.800");
  const lineColor = useColorModeValue("gray.200", "gray.700");
  const headerBg = useColorModeValue("white", "gray.900");
  const containerBg = useColorModeValue("white", "gray.900");
  const labelColor = useColorModeValue("gray.600", "gray.300");
  const rowBg = useColorModeValue("white", "gray.900");

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
            color={useColorModeValue("gray.700", "gray.100")}
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
                  bg={useColorModeValue("gray.50", "gray.800")}
                  color={useColorModeValue("gray.600", "gray.200")}
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
                    color={useColorModeValue("gray.800", "white")}
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

// Página principal de proyectos (solo UI demo con datos locales para evitar nuevas ventanas).
export const ErpProjectsPage: React.FC = () => {
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const accent = useColorModeValue("green.500", "green.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [activeTab, setActiveTab] = useState(0);
  const [ganttView, setGanttView] = useState<ViewMode>("week");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const toast = useToast();
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStart, setProjectStart] = useState("");
  const [projectEnd, setProjectEnd] = useState("");
  const [activities, setActivities] = useState<
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
  const [milestones, setMilestones] = useState<
    Array<{ id: string; name: string; start: string; end: string }>
  >([]);

  // Datos demo
  const projects: ErpProject[] = [
    {
      id: 1,
      name: "Proyecto Web Corporativo",
      description: "Desarrollo completo del sitio web corporativo",
      start_date: "2026-01-01",
      end_date: "2026-04-30",
    },
    {
      id: 2,
      name: "App Mobile",
      description: "Aplicación móvil para iOS y Android",
      start_date: "2026-02-01",
      end_date: "2026-05-31",
    },
  ];

  const tasks: ErpTask[] = [
    {
      id: 1,
      project_id: 1,
      name: "Diseño UI/UX",
      start_date: "2025-12-29",
      end_date: "2026-01-14",
      status: "completed",
      progress: 100,
    },
    {
      id: 2,
      project_id: 1,
      name: "Desarrollo Frontend",
      start_date: "2026-01-15",
      end_date: "2026-02-25",
      status: "in_progress",
      progress: 65,
    },
    {
      id: 3,
      project_id: 1,
      name: "Desarrollo Backend",
      start_date: "2026-01-18",
      end_date: "2026-03-25",
      status: "in_progress",
      progress: 40,
    },
    {
      id: 4,
      project_id: 2,
      name: "Arquitectura",
      start_date: "2026-01-20",
      end_date: "2026-02-10",
      status: "completed",
      progress: 100,
    },
    {
      id: 5,
      project_id: 2,
      name: "Desarrollo iOS",
      start_date: "2026-02-15",
      end_date: "2026-04-30",
      status: "in_progress",
      progress: 50,
    },
  ];

  const ganttTasks: GanttTask[] = useMemo(() => {
    const filtered = selectedProjectId === "all"
      ? tasks
      : tasks.filter((t) => String(t.project_id) === selectedProjectId);
    return filtered.map((task) => {
      const start = new Date(task.start_date);
      const end = new Date(task.end_date);
      const progress = task.progress ?? 0;
      let status: Status = "planned";
      if (task.status === "completed") status = "on-time";
      else if (end < new Date()) status = "overdue";
      else if (task.status === "in_progress") status = "planned";
      return {
        id: String(task.id),
        name: task.name,
        start,
        end,
        progress,
        type: "task",
        status,
        project: projects.find((p) => p.id === task.project_id)?.name,
      };
    });
  }, [selectedProjectId, tasks, projects]);

  const handleAddActivity = () => {
    setActivities((prev) => [
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
    setActivities((prev) =>
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
    setMilestones((prev) => [
      ...prev,
      { id: createId(), name: `Hito ${prev.length + 1}`, start: "", end: "" },
    ]);
  };

  const handleSaveProject = () => {
    if (!projectName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    const payload = {
      name: projectName.trim(),
      description: projectDescription.trim(),
      start_date: projectStart || null,
      end_date: projectEnd || null,
      activities,
      milestones,
    };
    console.log("Nuevo proyecto", payload);
    toast({ title: "Proyecto preparado (demo)", status: "success" });
  };

  const heroItems = [
    { label: "Proyectos activos", value: projects.length },
    { label: "Total tareas", value: tasks.length },
    {
      label: "Completadas",
      value: tasks.filter((t) => t.status === "completed").length,
    },
  ];

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

      <Tabs variant="line" colorScheme="green" isLazy index={activeTab} onChange={setActiveTab}>
          <TabList borderBottomWidth="1px">
            <Tab>Resumen</Tab>
            <Tab>Proyectos</Tab>
            <Tab>Diagrama de Gantt</Tab>
            <Tab>Crear</Tab>
          </TabList>
          <TabPanels mt={4}>
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
                  <Text fontSize="xs" color={subtleText}>
                    {project.start_date} — {project.end_date}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </TabPanel>

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
                    {projects.map((p) => (
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
                {activities.length === 0 && (
                  <Text fontSize="sm" color={subtleText}>
                    Añade actividades con peso y fechas.
                  </Text>
                )}
                {activities.map((act, idx) => (
                  <Box key={act.id} borderWidth="1px" borderRadius="md" p={3} bg={cardBg}>
                    <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3}>
                      <FormControl>
                        <FormLabel fontSize="sm">Actividad #{idx + 1}</FormLabel>
                        <Input
                          value={act.name}
                          onChange={(e) =>
                            setActivities((prev) =>
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
                            setActivities((prev) =>
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
                            setActivities((prev) =>
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
                            setActivities((prev) =>
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
                          setActivities((prev) => prev.filter((item) => item.id !== act.id))
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
                                  setActivities((prev) =>
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
                                  setActivities((prev) =>
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
                                  setActivities((prev) =>
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
                                  setActivities((prev) =>
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
                {milestones.length === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    Añade hitos con fechas.
                  </Text>
                ) : (
                  milestones.map((mil, idx) => (
                    <SimpleGrid key={mil.id} columns={{ base: 1, md: 4 }} spacing={3}>
                      <FormControl>
                        <FormLabel fontSize="sm">Hito #{idx + 1}</FormLabel>
                        <Input
                          value={mil.name}
                          onChange={(e) =>
                            setMilestones((prev) =>
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
                            setMilestones((prev) =>
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
                            setMilestones((prev) =>
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
                          setMilestones((prev) => prev.filter((m) => m.id !== mil.id))
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
              >
                Guardar proyecto (demo)
              </Button>
            </Stack>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </AppShell>
  );
};

export default ErpProjectsPage;
