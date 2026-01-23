// Vista principal de proyectos: creaci+n, resumen, diagrama Gantt y edici+n detallada.

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Badge,
  Box,
  Button,
  Divider,
  Editable,
  EditableInput,
  EditablePreview,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
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
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Thead,
  Th,
  Tooltip,
  Tr,
  Tfoot,
  useColorModeValue,
  useDisclosure,
  useToast,
  Switch,
  Tag,
  VStack,
  Wrap,
} from "@chakra-ui/react";

import { keyframes } from "@emotion/react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import axios from "axios";
import { apiClient } from "../api/client";

type SummaryYearlyData = {
  projectJustify: Record<number, number>;
  projectJustified: Record<number, number>;
  summaryMilestones: Record<number, Array<{ label: string; hours: number }>>;
};

type SummaryStorage = Record<number, SummaryYearlyData>;

const SUMMARY_STORAGE_KEY = "erp-summary-table-by-year";

const DEPARTMENT_COLOR_SCHEMES = [
  "teal",
  "cyan",
  "green",
  "orange",
  "purple",
  "pink",
  "blue",
  "red",
  "yellow",
  "gray",
];

const createEmptyYearData = (): SummaryYearlyData => ({
  projectJustify: {},
  projectJustified: {},
  summaryMilestones: {},
});

// Normaliza conceptos (lowercase + sin acentos) para evitar duplicados.
const normalizeConceptKey = (value?: string) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Estilos por categoría para la tabla de presupuestos.
const CATEGORY_COLOR_MAP: Record<string, string | undefined> = {
  [normalizeConceptKey("EQUIPOS (Amortizacion)")]: "#dff0d8",
  [normalizeConceptKey("PERSONAL")]: "#e0f7da",
  [normalizeConceptKey("Doctores")]: undefined,
  [normalizeConceptKey("MATERIAL FUNGIBLE")]: "#e9f7ef",
  [normalizeConceptKey("COLABORACIONES EXTERNAS")]: "#e8f4fd",
  [normalizeConceptKey("GASTOS GENERALES (19%)")]: "#efe9ff",
  [normalizeConceptKey("OTROS GASTOS")]: "#f8f9d2",
  [normalizeConceptKey("Total")]: "#d9c2f0",
  [normalizeConceptKey("Diferencia")]: "#e7c4f7",
};

const BUDGET_ORDER = [
  normalizeConceptKey("EQUIPOS (Amortizacion)"),
  normalizeConceptKey("PERSONAL"),
  normalizeConceptKey("Doctores"),
  normalizeConceptKey("Titulados universitarios"),
  normalizeConceptKey("No titulado"),
  normalizeConceptKey("MATERIAL FUNGIBLE"),
  normalizeConceptKey("Materiales para pruebas y ensayos"),
  normalizeConceptKey("COLABORACIONES EXTERNAS"),
  normalizeConceptKey("Centros Tecnologicos (CETIM)"),
  normalizeConceptKey("GASTOS GENERALES (19%)"),
  normalizeConceptKey("OTROS GASTOS"),
  normalizeConceptKey("Auditoria"),
  normalizeConceptKey("Dictamen acreditado ENAC de informe DNSH"),
];

const cloneYearData = (data: SummaryYearlyData): SummaryYearlyData => ({
  projectJustify: { ...data.projectJustify },
  projectJustified: { ...data.projectJustified },
  summaryMilestones: Object.fromEntries(
    Object.entries(data.summaryMilestones || {}).map(([projId, items]) => [
      Number(projId),
      (items || []).map((item) => ({
        label: item.label,
        hours: item.hours,
      })),
    ]),
  ),
});

const readSummaryStorage = (): SummaryStorage => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(SUMMARY_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to read summary storage", err);
  }
  return {};
};

const writeSummaryStorage = (value: SummaryStorage) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to write summary storage", err);
  }
};

const loadSummaryFallback = (year: number): SummaryYearlyData => {
  const storage = readSummaryStorage();
  const entry = storage[year];
  return entry ? cloneYearData(entry) : createEmptyYearData();
};

const persistSummaryFallback = (year: number, data: SummaryYearlyData) => {
  const storage = readSummaryStorage();
  storage[year] = cloneYearData(data);
  writeSummaryStorage(storage);
};

import {
  fetchErpProjects,
  type ErpProject as ErpProjectApi,
} from "../api/erpReports";

import {
  createErpProject,
  deleteErpProject,
  updateErpProject,
} from "../api/erpManagement";

import {
  fetchErpTasks,
  type ErpTask as ErpTaskApi,
} from "../api/erpTimeTracking";

import { useCurrentUser } from "../hooks/useCurrentUser";

import {
  createProjectBudgetLine,
  deleteProjectBudgetLine,
  fetchProjectBudgets,
  fetchBudgetMilestones,
  type ProjectBudgetLine,
  type ProjectBudgetLinePayload,
  type BudgetLineMilestone,
  type ProjectBudgetMilestone,
  createBudgetMilestone,
  deleteBudgetMilestone,
  updateBudgetMilestone,
  type ProjectBudgetLineUpdatePayload,
  updateProjectBudgetLine,
} from "../api/erpBudgets";

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

import {
  fetchEmployees,
  fetchDepartments,
  fetchEmployeeAllocations,
  createEmployeeAllocation,
  updateEmployeeAllocation,
  type EmployeeProfile,
  type Department,
  type EmployeeAllocation,
} from "../api/hr";

const YEAR_FILTER_OPTIONS = [2024, 2025, 2026, 2027];

const fetchSummaryData = async (year: number): Promise<SummaryYearlyData> => {
  try {
    const response = await apiClient.get<SummaryYearlyData>(
      `/api/v1/erp/summary/${year}`,
    );
    await persistSummaryFallback(year, response.data);
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return loadSummaryFallback(year);
    }
    console.warn("Fallo al cargar resumen, usando almacenamiento local", err);
    return loadSummaryFallback(year);
  }
};

const saveSummaryData = async ({
  year,
  payload,
}: {
  year: number;
  payload: SummaryYearlyData;
}): Promise<void> => {
  try {
    await apiClient.put<SummaryYearlyData>(
      `/api/v1/erp/summary/${year}`,
      payload,
    );
    await persistSummaryFallback(year, payload);
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      (err.response?.status === 404 || err.code === "ERR_NETWORK")
    ) {
      persistSummaryFallback(year, payload);
      return;
    }
    console.error(err);
    throw err;
  }
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function useDebouncedSave<T>(
  fn: (value: T) => Promise<void>,
  delay = 600,
  onStatus?: (status: SaveStatus) => void,
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const trigger = (value: T) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onStatus?.("saving");
    timeoutRef.current = setTimeout(async () => {
      try {
        await fn(value);
        onStatus?.("saved");
        setTimeout(() => onStatus?.("idle"), 800);
      } catch (err) {
        console.error(err);
        onStatus?.("error");
      }
    }, delay);
  };

  return trigger;
}

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

type BudgetModalMode = "create" | "edit";

const DEFAULT_BUDGET_PAYLOAD: ProjectBudgetLinePayload = {
  concept: "",
  hito1_budget: 0,
  justified_hito1: 0,
  hito2_budget: 0,
  justified_hito2: 0,
  approved_budget: 0,
  percent_spent: 0,
  forecasted_spent: 0,
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

const formatEuroValue = (value: number) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);

const EuroCell: React.FC<{ value: number; color?: string; bold?: boolean }> = ({
  value,
  color,
  bold = true,
}) => (
  <Text
    color={color ?? "green.700"}
    fontWeight={bold ? "semibold" : "normal"}
    fontFamily="mono"
    whiteSpace="nowrap"
  >
    {formatEuroValue(value)} 
  </Text>
);

const BudgetNumberCell: React.FC<{
  value: number;
  onSubmit: (value: string) => void;
  isEditing: boolean;
  min?: number;
}> = ({ value, onSubmit, isEditing, min = 0 }) =>
  isEditing ? (
    <Input
      size="sm"
      type="text"
      inputMode="decimal"
      pattern="[0-9.,]*"
      defaultValue={value.toLocaleString("es-ES")}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const normalized = raw
          .replace(/\./g, "") // quita separadores de miles
          .replace(",", "."); // convierte coma decimal a punto
        onSubmit(normalized === "" ? "0" : normalized);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const target = e.target as HTMLInputElement;
          const raw = target.value.trim();
          const normalized = raw.replace(/\./g, "").replace(",", ".");
          onSubmit(normalized === "" ? "0" : normalized);
        }
      }}
    />
  ) : (
    <EuroCell value={value} />
  );

interface GanttTask {
  id: string;

  name: string;

  start: Date;

  end: Date;

  progress: number;

  type: "task" | "milestone" | "project";

  status: Status;

  project?: string;

  projectId?: number;

  activityId?: number;

  hasMilestones?: boolean;

  milestoneDates?: Date[];
}

interface ProfessionalGanttProps {
  tasks: GanttTask[];

  viewMode?: ViewMode;

  centerOnToday?: boolean;

  onProjectClick?: (projectId: number) => void;

  showMilestoneLines?: boolean;
}

const toDateSafe = (value?: string | null): Date | null => {
  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d;
};

// Normaliza fechas ISO (con tiempo) a formato yyyy-MM-dd para inputs type="date".

const toDateInput = (value?: string | null) =>
  value ? value.split("T")[0] : "";

// Helper simple para ids locales.

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const ProfessionalGantt: React.FC<ProfessionalGanttProps> = ({
  tasks,

  viewMode = "month",

  centerOnToday = false,

  onProjectClick,

  showMilestoneLines = true,
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

  const leftColumnWidth = 300;

  const scrollRef = useRef<HTMLDivElement>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  const [todayLeftPx, setTodayLeftPx] = useState<number | null>(null);

  // Calcula rango de fechas a mostrar seg+n las tareas cargadas.

  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();

      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),

        end: new Date(now.getFullYear(), now.getMonth() + 3, 0),
      };
    }

    const allDates = tasks.flatMap((task) => [task.start, task.end]);

    const minDate = new Date(
      Math.min(...allDates.map((date) => date.getTime())),
    );

    const maxDate = new Date(
      Math.max(...allDates.map((date) => date.getTime())),
    );

    const paddedStart =
      viewMode === "week"
        ? new Date(
            minDate.getFullYear(),

            minDate.getMonth(),

            minDate.getDate() - 7,
          )
        : new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    const paddedEnd =
      viewMode === "week"
        ? new Date(
            maxDate.getFullYear(),

            maxDate.getMonth(),

            maxDate.getDate() + 14,
          )
        : new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);

    return { start: paddedStart, end: paddedEnd };
  }, [tasks, viewMode]);

  // Genera columnas de tiempo (d+as o meses) para el encabezado.

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

  // Posiciones verticales de hitos (porcentaje sobre el timeline) para dibujar l+neas globales.

  const milestoneLines = useMemo(() => {
    if (!showMilestoneLines) return [];

    const positions: number[] = [];

    tasks.forEach((task) => {
      if (task.type === "milestone") {
        const pct =
          ((task.start.getTime() - dateRange.start.getTime()) /
            (dateRange.end.getTime() - dateRange.start.getTime())) *
          100;

        if (!Number.isNaN(pct)) positions.push(pct);
      }

      if (task.type === "project" && task.milestoneDates) {
        task.milestoneDates.forEach((mDate) => {
          const pct =
            ((mDate.getTime() - dateRange.start.getTime()) /
              (dateRange.end.getTime() - dateRange.start.getTime())) *
            100;

          if (!Number.isNaN(pct)) positions.push(pct);
        });
      }
    });

    // Dedup por redondeo.

    return Array.from(new Set(positions.map((p) => Number(p.toFixed(3)))));
  }, [tasks, dateRange, showMilestoneLines]);

  // Lineas verticales para separar anos en el timeline.

  const yearBoundaryLines = useMemo(() => {
    const positions: Array<{ pct: number; year: number }> = [];

    const rangeMs = dateRange.end.getTime() - dateRange.start.getTime();

    if (rangeMs <= 0) return positions;

    let current = new Date(dateRange.start.getFullYear(), 0, 1);

    if (current <= dateRange.start) {
      current = new Date(current.getFullYear() + 1, 0, 1);
    }

    while (current < dateRange.end) {
      const pct =
        ((current.getTime() - dateRange.start.getTime()) / rangeMs) * 100;

      if (!Number.isNaN(pct)) {
        positions.push({ pct, year: current.getFullYear() });
      }

      current = new Date(current.getFullYear() + 1, 0, 1);
    }

    return positions;
  }, [dateRange]);

  // Colores de barra segun estado.

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

  // L+nea de hoy en el Gantt.

  const getTodayPosition = () => {
    const today = new Date();

    const offset =
      (today.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24);

    return (offset / totalDays) * 100;
  };

  // Centra la vista en la fecha actual al cargar/actualizar.

  useEffect(() => {
    if (
      !centerOnToday ||
      !scrollRef.current ||
      !contentRef.current ||
      tasks.length === 0
    )
      return;

    const container = scrollRef.current;

    const content = contentRef.current;

    const todayPos = getTodayPosition();

    const target =
      (todayPos / 100) * content.scrollWidth - container.clientWidth / 2;

    container.scrollTo({ left: Math.max(target, 0), behavior: "smooth" });
  }, [centerOnToday, tasks, viewMode, dateRange]);

  // Calcula posici+n de la l+nea "hoy" respecto al +irea de timeline (sin la columna izquierda).

  useLayoutEffect(() => {
    if (!contentRef.current) return;

    const timelineWidth = contentRef.current.clientWidth - leftColumnWidth;

    const todayPos = getTodayPosition();

    const px = (todayPos / 100) * timelineWidth;

    if (px < 0 || px > timelineWidth) {
      setTodayLeftPx(null);
    } else {
      setTodayLeftPx(px);
    }
  }, [dateRange, timeColumns, tasks, leftColumnWidth]);

  const formatDate = (date: Date) => {
    if (viewMode === "week") {
      return date.toLocaleDateString("es-ES", {
        day: "2-digit",

        month: "short",
      });
    }

    return date.toLocaleDateString("es-ES", {
      month: "short",

      year: "numeric",
    });
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
      borderWidth="1px"
      borderRadius="xl"
      bg={containerBg}
      boxShadow="sm"
      overflow="hidden"
    >
      {/* Encabezado fijo */}

      <Box minW="1100px">
        <Flex
          position="sticky"
          top={0}
          zIndex={2}
          bg={headerBg}
          borderBottomWidth="1px"
        >
          <Box
            w="300px"
            px={4}
            py={3}
            fontWeight="semibold"
            fontSize="sm"
            color={headerTitleColor}
            borderRightWidth="1px"
          >
            Elemento / Proyecto / Fechas
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
      </Box>

      {/* Zona scrolleable (horizontal + vertical) */}

      <Box
        ref={scrollRef}
        overflowX="auto"
        overflowY="auto"
        maxH="620px"
        position="relative"
      >
        <Box position="relative" bg={rowBg} minW="1100px" ref={contentRef}>
          {yearBoundaryLines.length > 0 && (
            <Box
              position="absolute"
              top={-260}
              bottom={0}
              left={`${leftColumnWidth}px`}
              right={0}
              pointerEvents="none"
              zIndex={2}
            >
              {yearBoundaryLines.map(({ pct, year }) => (
                <Box
                  key={`year-line-${year}-${pct}`}
                  position="absolute"
                  top={0}
                  bottom={0}
                  left={`${pct}%`}
                  borderLeft="2px dashed black"
                  opacity={0.7}
                />
              ))}
            </Box>
          )}

          {milestoneLines.length > 0 && (
            <Box
              position="absolute"
              top={-260}
              bottom={0}
              left={`${leftColumnWidth}px`}
              right={0}
              pointerEvents="none"
              zIndex={3}
            >
              {milestoneLines.map((pct, idx) => (
                <Box
                  key={`ms-line-${idx}-${pct}`}
                  position="absolute"
                  top={0}
                  bottom={0}
                  left={`${pct}%`}
                  borderLeft="2px dashed red"
                />
              ))}
            </Box>
          )}

          {tasks.map((task, idx) => {
            const isMilestone = task.type === "milestone";

            const barPosition = getBarStyle(task);

            const typeLabel = task.id.startsWith("project-")
              ? "Proyecto"
              : task.id.startsWith("activity-")
                ? "Actividad"
                : task.id.startsWith("subactivity-")
                  ? "Subactividad"
                  : isMilestone
                    ? "Hito"
                    : "Tarea";

            return (
              <Flex
                key={task.id}
                borderBottomWidth="1px"
                borderColor={lineColor}
                _hover={{ bg: gridBg }}
                transition="background-color 0.15s ease"
                bg={idx % 2 === 0 ? rowBg : gridBg}
                cursor={task.type === "project" ? "pointer" : "default"}
                onClick={() => {
                  if (
                    task.type === "project" &&
                    task.projectId &&
                    onProjectClick
                  ) {
                    onProjectClick(task.projectId);
                  }
                }}
              >
                <HStack
                  spacing={3}
                  w="300px"
                  px={4}
                  py={3}
                  borderRightWidth="1px"
                  borderColor={lineColor}
                  align="center"
                  role={task.type === "project" ? "button" : undefined}
                  cursor={task.type === "project" ? "pointer" : "default"}
                  onClick={() => {
                    if (
                      task.type === "project" &&
                      task.projectId &&
                      onProjectClick
                    ) {
                      onProjectClick(task.projectId);
                    }
                  }}
                  _hover={
                    task.type === "project"
                      ? { bg: gridBg, transition: "background 0.15s ease" }
                      : undefined
                  }
                >
                  <Box flex="1" minW={0}>
                    <Text
                      fontSize="sm"
                      fontWeight="semibold"
                      noOfLines={1}
                      color={taskTitleColor}
                    >
                      {task.name}
                    </Text>

                    <HStack spacing={2} mt={1} align="center">
                      <Tag
                        size="sm"
                        colorScheme={isMilestone ? "purple" : "gray"}
                      >
                        {typeLabel}
                      </Tag>

                      {task.type === "project" && task.hasMilestones && (
                        <Box
                          w="10px"
                          h="10px"
                          bg="purple.500"
                          transform="rotate(45deg)"
                          borderRadius="2px"
                          boxShadow="sm"
                          border="1px solid rgba(255,255,255,0.7)"
                        />
                      )}

                      {task.project && (
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>
                          {task.project}
                        </Text>
                      )}
                    </HStack>

                    <Text fontSize="xs" color="gray.500">
                      {task.start.toLocaleDateString("es-ES")} OCo{" "}
                      {task.end.toLocaleDateString("es-ES")}
                    </Text>
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

                  <Tooltip
                    label={`${task.name} -A ${typeLabel}${
                      task.project ? ` -A ${task.project}` : ""
                    }\n${task.start.toLocaleDateString("es-ES")} OCo ${task.end.toLocaleDateString("es-ES")}`}
                    hasArrow
                    bg="gray.800"
                    color="white"
                    fontSize="xs"
                    borderRadius="md"
                    p={2}
                    whiteSpace="pre-line"
                    openDelay={150}
                  >
                    {isMilestone ? (
                      <Box
                        position="absolute"
                        top={-260}
                        bottom={0}
                        left={barPosition.left}
                        borderLeft="2px dashed red"
                        transform="translateX(-50%)"
                        pointerEvents="none"
                        zIndex={2}
                      />
                    ) : (
                      <Box
                        position="absolute"
                        top="50%"
                        transform="translateY(-50%)"
                        h="32px"
                        borderRadius="md"
                        bg={getStatusColor(task.status)}
                        cursor="pointer"
                        boxShadow="md"
                        transition="all 0.15s ease"
                        _hover={{
                          boxShadow: "lg",

                          transform: "translateY(-50%) scale(1.02)",
                        }}
                        {...barPosition}
                      >
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
                      </Box>
                    )}
                  </Tooltip>
                </Box>
              </Flex>
            );
          })}

          {todayLeftPx !== null && (
            <Box
              position="absolute"
              top={0}
              bottom={0}
              left={`${leftColumnWidth}px`}
              right={0}
              pointerEvents="none"
            >
              <Box
                position="absolute"
                top={0}
                bottom={0}
                left={`${todayLeftPx}px`}
                w="2px"
                bg="green.600"
              >
                <Box
                  position="absolute"
                  top="-24px"
                  left="50%"
                  transform="translateX(-50%)"
                  bg="green.600"
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
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

interface BudgetModalForm {
  concept: string;
  hito1_budget: string;
  justified_hito1: string;
  hito2_budget: string;
  justified_hito2: string;
  approved_budget: string;
  percent_spent: string;
  forecasted_spent: string;
}

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: ProjectBudgetLinePayload) => void;
  initialValues?: ProjectBudgetLinePayload;
  title: string;
  submitLabel?: string;
  isSaving?: boolean;
}

const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialValues,
  title,
  submitLabel,
  isSaving = false,
}) => {
  const [form, setForm] = useState<BudgetModalForm>({
    concept: "",
    hito1_budget: "",
    justified_hito1: "",
    hito2_budget: "",
    justified_hito2: "",
    approved_budget: "",
    percent_spent: "",
    forecasted_spent: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      concept: initialValues?.concept ?? "",
      hito1_budget:
        initialValues?.hito1_budget !== undefined
          ? String(initialValues.hito1_budget)
          : "",
      justified_hito1:
        initialValues?.justified_hito1 !== undefined
          ? String(initialValues.justified_hito1)
          : "",
      hito2_budget:
        initialValues?.hito2_budget !== undefined
          ? String(initialValues.hito2_budget)
          : "",
      justified_hito2:
        initialValues?.justified_hito2 !== undefined
          ? String(initialValues.justified_hito2)
          : "",
      approved_budget:
        initialValues?.approved_budget !== undefined
          ? String(initialValues.approved_budget)
          : "",
      percent_spent:
        initialValues?.percent_spent !== undefined
          ? String(initialValues.percent_spent)
          : "",
      forecasted_spent:
        initialValues?.forecasted_spent !== undefined
          ? String(initialValues.forecasted_spent)
          : "",
    });
  }, [initialValues, isOpen]);

  const parseNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const hitoSum =
    parseNumber(form.hito1_budget) + parseNumber(form.hito2_budget);
  const approvedValue = parseNumber(form.approved_budget);
  const totalsMatch = Math.abs(hitoSum - approvedValue) < 0.01;

  const handleSubmit = () => {
    onSave({
      concept: form.concept.trim(),
      hito1_budget: parseNumber(form.hito1_budget),
      justified_hito1: parseNumber(form.justified_hito1),
      hito2_budget: parseNumber(form.hito2_budget),
      justified_hito2: parseNumber(form.justified_hito2),
      approved_budget: parseNumber(form.approved_budget),
      percent_spent: parseNumber(form.percent_spent),
      forecasted_spent: parseNumber(form.forecasted_spent),
    });
  };

  const updateField = (field: keyof BudgetModalForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3}>
            <FormControl isRequired>
              <FormLabel>Concepto</FormLabel>
              <Input
                value={form.concept}
                onChange={(e) => updateField("concept", e.target.value)}
              />
            </FormControl>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Hito 1</FormLabel>
                <Input
                  type="number"
                  value={form.hito1_budget}
                  onChange={(e) => updateField("hito1_budget", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Justificado H1</FormLabel>
                <Input
                  type="number"
                  value={form.justified_hito1}
                  onChange={(e) =>
                    updateField("justified_hito1", e.target.value)
                  }
                />
              </FormControl>
            </SimpleGrid>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Hito 2</FormLabel>
                <Input
                  type="number"
                  value={form.hito2_budget}
                  onChange={(e) => updateField("hito2_budget", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Justificado H2</FormLabel>
                <Input
                  type="number"
                  value={form.justified_hito2}
                  onChange={(e) =>
                    updateField("justified_hito2", e.target.value)
                  }
                />
              </FormControl>
            </SimpleGrid>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Total aprobado</FormLabel>
                <Input
                  type="number"
                  value={form.approved_budget}
                  onChange={(e) =>
                    updateField("approved_budget", e.target.value)
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>% Gastado</FormLabel>
                <Input
                  type="number"
                  value={form.percent_spent}
                  onChange={(e) => updateField("percent_spent", e.target.value)}
                />
              </FormControl>
            </SimpleGrid>
            <FormControl>
              <FormLabel>Gasto previsto</FormLabel>
              <Input
                type="number"
                value={form.forecasted_spent}
                onChange={(e) =>
                  updateField("forecasted_spent", e.target.value)
                }
              />
            </FormControl>
            <Text color={totalsMatch ? "green.500" : "red.500"} fontSize="sm">
              {totalsMatch
                ? "El total aprobado coincide con la suma de Hito 1 y Hito 2."
                : "El total aprobado debe igualar la suma de los hitos."}
            </Text>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            colorScheme="green"
            onClick={handleSubmit}
            isDisabled={!totalsMatch || !form.concept.trim()}
            isLoading={isSaving}
          >
            {submitLabel ?? "Guardar"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Pagina principal de proyectos: resumen, listado, Gantt, creacion y edicion detallada.

export const ErpProjectsPage: React.FC = () => {
  // Tokens de estilo y animaci+n para la cabecera hero.

  const cardBg = useColorModeValue("white", "gray.700");

  const panelBg = useColorModeValue("gray.50", "gray.800");

  const subtleText = useColorModeValue("gray.600", "gray.300");

  const accent = useColorModeValue("green.500", "green.300");

  const fadeUp = keyframes`

    from { opacity: 0; transform: translateY(12px); }

    to { opacity: 1; transform: translateY(0); }

  `;

  // Estado de navegacion, filtros y utilidades.

  const [activeTab, setActiveTab] = useState(0);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  const toast = useToast();

  const queryClient = useQueryClient();

  // Formulario de creacion de proyectos.

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

  const [budgetProjectFilter, setBudgetProjectFilter] = useState<string>("");

  // Estado del drawer de detalle/edicion.

  const [detailsOpen, setDetailsOpen] = useState(false);

  const [selectedProject, setSelectedProject] = useState<ErpProjectApi | null>(
    null,
  );

  const [editName, setEditName] = useState("");

  const [editDescription, setEditDescription] = useState("");

  const [editStart, setEditStart] = useState("");

  const [editEnd, setEditEnd] = useState("");

  const [editActive, setEditActive] = useState(true);

  const [activityEdits, setActivityEdits] = useState<
    Record<
      number,
      { name: string; start: string; end: string; description: string }
    >
  >({});

  const [subactivityEdits, setSubactivityEdits] = useState<
    Record<
      number,
      { name: string; start: string; end: string; description: string }
    >
  >({});

  const [milestoneEdits, setMilestoneEdits] = useState<
    Record<number, { title: string; due: string; description: string }>
  >({});

  const [summaryYear, setSummaryYear] = useState<number>(
    new Date().getFullYear(),
  );

  const [allocationDraftsState, setAllocationDrafts] = useState<
    Record<string, string>
  >({});

  const [summarySearch, setSummarySearch] = useState("");

  const [summaryEditMode, setSummaryEditMode] = useState(false);

  const [projectJustify, setProjectJustify] = useState<Record<number, number>>(
    {},
  );

  const [projectJustified, setProjectJustified] = useState<
    Record<number, number>
  >({});

  const [summaryMilestones, setSummaryMilestones] = useState<
    Record<number, Array<{ label: string; hours: number }>>
  >({});

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">(
    "all",
  );
  const {
    isOpen: isAddModalOpen,
    onOpen: onOpenAddModal,
    onClose: onCloseAddModal,
  } = useDisclosure();
  const [addDrawerDeptFilter, setAddDrawerDeptFilter] = useState<
    number | "all"
  >("all");
  const [addDrawerSearch, setAddDrawerSearch] = useState("");

  const [allocationEdits, setAllocationEdits] = useState<
    Record<string, string>
  >({});

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipAutoSaveRef = useRef(true);

  const { data: storedYearData, isFetching: loadingSummaryYear } = useQuery<
    SummaryYearlyData | undefined
  >({
    queryKey: ["erp-summary", summaryYear],
    queryFn: () => fetchSummaryData(summaryYear),
    refetchOnWindowFocus: false,
  });

  const saveSummaryMutation = useMutation({
    mutationFn: saveSummaryData,
  });

  const saveSummaryDebounced = useDebouncedSave<{
    year: number;
    payload: SummaryYearlyData;
  }>((value) => saveSummaryMutation.mutateAsync(value), 700, setSaveStatus);

  const saveStatusLabel = {
    idle: "",
    saving: "Guardando los cambios...",
    saved: "Cambios guardados",
    error: "Error al guardar",
  }[saveStatus];

  useEffect(() => {
    skipAutoSaveRef.current = true;
    if (storedYearData) {
      setProjectJustify(storedYearData.projectJustify ?? {});
      setProjectJustified(storedYearData.projectJustified ?? {});
      setSummaryMilestones(storedYearData.summaryMilestones ?? {});
    } else {
      setProjectJustify({});
      setProjectJustified({});
      setSummaryMilestones({});
    }
  }, [storedYearData]);

  useEffect(() => {
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    saveSummaryDebounced({
      year: summaryYear,
      payload: {
        projectJustify,
        projectJustified,
        summaryMilestones,
      },
    });
  }, [projectJustify, projectJustified, summaryMilestones, summaryYear]);

  const milestoneTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    Object.entries(summaryMilestones).forEach(([projectId, items]) => {
      totals[Number(projectId)] = items.reduce(
        (sum, item) => sum + Number(item.hours ?? 0),
        0,
      );
    });
    return totals;
  }, [summaryMilestones]);

  const addMilestoneRow = (projectId: number) =>
    setSummaryMilestones((prev) => {
      const list = prev[projectId] ?? [];
      return {
        ...prev,
        [projectId]: [...list, { label: `H${list.length + 1}`, hours: 0 }],
      };
    });

  const updateMilestoneRow = (
    projectId: number,
    index: number,
    field: "label" | "hours",
    value: string,
  ) =>
    setSummaryMilestones((prev) => {
      const list = prev[projectId] ?? [];
      if (!list[index]) return prev;
      const next = [...list];
      next[index] = {
        ...next[index],
        [field]: field === "hours" ? Number(value || 0) : value,
      };
      return { ...prev, [projectId]: next };
    });

  const { data: currentUser } = useCurrentUser();

  // Fetch basico: proyectos, tareas, actividades, subactividades e hitos.

  const { data: projects = [] } = useQuery<ErpProjectApi[]>({
    queryKey: ["erp-projects"],

    queryFn: fetchErpProjects,
  });

  useEffect(() => {
    if (!budgetProjectFilter && projects.length > 0) {
      setBudgetProjectFilter(String(projects[0].id));
    }
  }, [budgetProjectFilter, projects]);

  const { data: rawTasks = [] } = useQuery<ErpTaskApi[]>({
    queryKey: ["erp-tasks"],

    queryFn: fetchErpTasks,
  });

  // Si es super admin sin tenant seleccionado, traemos todos los empleados (sin filtro de tenant).

  const hrTenantId = currentUser?.tenant_id ?? undefined;

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

  const {
    data: hrEmployees = [],
    isError: employeesError,
    error: employeesErrorMsg,
    isLoading: employeesLoading,
  } = useQuery<EmployeeProfile[]>({
    queryKey: ["hr-employees", hrTenantId],

    queryFn: () => fetchEmployees(hrTenantId),

    enabled: !!currentUser?.id,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {
    data: hrDepartments = [],
    isError: departmentsError,
    error: departmentsErrorMsg,
    isLoading: departmentsLoading,
  } = useQuery<Department[]>({
    queryKey: ["hr-departments", hrTenantId],

    queryFn: () => fetchDepartments(hrTenantId),

    enabled: !!currentUser?.id,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const { data: allocations = [], isError: allocationsError } = useQuery<
    EmployeeAllocation[]
  >({
    queryKey: ["hr-allocations", summaryYear, hrTenantId],

    queryFn: () =>
      fetchEmployeeAllocations({
        year: summaryYear,
        tenantId: hrTenantId ?? undefined,
      }),

    enabled: !!currentUser?.id,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const getAllocationTotal = useCallback(
    (projectId: number, milestoneLabel: string) => {
      return allocations.reduce((sum, alloc) => {
        if (alloc.year !== summaryYear) return sum;
        if (alloc.project_id !== projectId) return sum;
        const label = alloc.milestone || "Sin hitos";
        if (label !== milestoneLabel) return sum;
        return sum + Number(alloc.allocated_hours ?? 0);
      }, 0);
    },
    [allocations, summaryYear],
  );

  // Sincroniza el formulario de edicion con el proyecto seleccionado.

  useEffect(() => {
    if (!selectedProject) return;

    setEditName(selectedProject.name ?? "");

    setEditDescription(selectedProject.description ?? "");

    setEditStart(toDateInput(selectedProject.start_date));

    setEditEnd(toDateInput(selectedProject.end_date));

    setEditActive(selectedProject.is_active ?? true);
  }, [selectedProject]);

  // Normaliza tareas para calcular progreso y alimentar metricas.

  const tasks: ErpTask[] = useMemo(() => {
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
  }, [rawTasks]);

  const totalTasks = rawTasks.length;

  const completedTasks = rawTasks.filter(
    (task) =>
      task.is_completed ||
      task.status === "done" ||
      task.status === "completed",
  ).length;

  // Filtra elementos asociados al proyecto seleccionado para el drawer.

  const selectedProjectActivities = useMemo(
    () =>
      selectedProject
        ? activities.filter((act) => act.project_id === selectedProject.id)
        : [],

    [selectedProject, activities],
  );

  const selectedProjectMilestones = useMemo(
    () =>
      selectedProject
        ? milestones.filter((mil) => mil.project_id === selectedProject.id)
        : [],

    [selectedProject, milestones],
  );

  const selectedProjectTasks = useMemo(
    () =>
      selectedProject
        ? rawTasks.filter((task) => task.project_id === selectedProject.id)
        : [],

    [selectedProject, rawTasks],
  );

  const selectedProjectSubactivities = useMemo(() => {
    if (!selectedProject) return [];

    const activityIds = new Set(selectedProjectActivities.map((a) => a.id));

    return subactivities.filter((sub) => activityIds.has(sub.activity_id));
  }, [selectedProject, selectedProjectActivities, subactivities]);

  // Prepara formularios locales para actividades, subactividades e hitos del proyecto.

  useEffect(() => {
    if (!selectedProject) return;

    const nextActivities: Record<
      number,
      { name: string; start: string; end: string; description: string }
    > = {};

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

    const nextMilestones: Record<
      number,
      { title: string; due: string; description: string }
    > = {};

    selectedProjectMilestones.forEach((mil) => {
      nextMilestones[mil.id] = {
        title: mil.title ?? "",

        due: toDateInput(mil.due_date),

        description: mil.description ?? "",
      };
    });

    setMilestoneEdits(nextMilestones);
  }, [
    selectedProject,

    selectedProjectActivities,

    selectedProjectSubactivities,

    selectedProjectMilestones,
  ]);

  const projectNameMap = useMemo(() => {
    const map = new Map<number, string>();

    projects.forEach((project) => {
      map.set(project.id, project.name);
    });

    return map;
  }, [projects]);

  const projectMap = useMemo(() => {
    const map = new Map<number, ErpProjectApi>();

    projects.forEach((project) => map.set(project.id, project));

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

  // Construye la coleccion de items de Gantt (proyectos, actividades, subactividades, hitos).

  const ganttItems: GanttTask[] = useMemo(() => {
    const items: GanttTask[] = [];

    const now = new Date();

    projects.forEach((project) => {
      const projectStart = toDateSafe(project.start_date) ?? new Date();

      const projectEnd =
        toDateSafe(project.end_date) ??
        new Date(projectStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      const progress = computeProgress(projectStart, projectEnd);

      const status: Status =
        now >= projectEnd
          ? "on-time"
          : now >= projectStart
            ? "planned"
            : "planned";

      const projectMilestones = milestones.filter(
        (m) => m.project_id === project.id,
      );

      const milestoneDates = projectMilestones

        .map(
          (m) =>
            toDateSafe(m.due_date) ??
            toDateSafe((m as any).end_date) ??
            toDateSafe((m as any).start_date),
        )

        .filter((d): d is Date => Boolean(d));

      items.push({
        id: `project-${project.id}`,

        name: project.name,

        start: projectStart,

        end: projectEnd,

        progress,

        type: "project",

        status,

        project: project.name,

        projectId: project.id,

        activityId: undefined,

        hasMilestones: projectMilestones.length > 0,

        milestoneDates,
      });
    });

    activities.forEach((activity) => {
      const project = projectMap.get(activity.project_id);

      const fallbackStart = project ? toDateSafe(project.start_date) : null;

      const fallbackEnd = project ? toDateSafe(project.end_date) : null;

      const start =
        toDateSafe(activity.start_date) ?? fallbackStart ?? new Date();

      const end =
        toDateSafe(activity.end_date) ??
        fallbackEnd ??
        new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

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

        activityId: activity.id,
      });
    });

    subactivities.forEach((subactivity) => {
      const activity = activityMap.get(subactivity.activity_id);

      const project = activity ? projectMap.get(activity.project_id) : null;

      if (!activity) return;

      const fallbackStart =
        toDateSafe(activity.start_date) ??
        (project ? toDateSafe(project.start_date) : null);

      const fallbackEnd =
        toDateSafe(activity.end_date) ??
        (project ? toDateSafe(project.end_date) : null);

      const start =
        toDateSafe(subactivity.start_date) ?? fallbackStart ?? new Date();

      const end =
        toDateSafe(subactivity.end_date) ??
        fallbackEnd ??
        new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);

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

        activityId: subactivity.activity_id,
      });
    });

    milestones.forEach((milestone) => {
      const project = projectMap.get(milestone.project_id);

      const fallbackDue =
        toDateSafe(milestone.due_date) ??
        toDateSafe(project?.end_date) ??
        toDateSafe(project?.start_date) ??
        new Date();

      const due = fallbackDue;

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

        activityId: milestone.activity_id ?? undefined,
      });
    });

    // Tareas sueltas (sin subactividad) tambi+n al Gantt.

    rawTasks.forEach((task) => {
      if (!task.start_date || !task.end_date) return;

      const start = new Date(task.start_date as string);

      const end = new Date(task.end_date as string);

      const progress =
        task.is_completed || task.status === "done"
          ? 100
          : computeProgress(start, end);

      const status: Status =
        task.is_completed || task.status === "done"
          ? "on-time"
          : task.status === "in_progress"
            ? "at-risk"
            : "planned";

      items.push({
        id: `task-${task.id}`,

        name: task.title,

        start,

        end,

        progress,

        type: "task",

        status,

        project: projectNameMap.get(task.project_id ?? 0),

        projectId: task.project_id ?? undefined,
      });
    });

    return items;
  }, [
    projects,

    activities,

    subactivities,

    milestones,

    rawTasks,

    projectNameMap,

    projectMap,

    activityMap,
  ]);

  const ganttProjects = projects;

  const ganttTasks: GanttTask[] = useMemo(() => {
    // Vista general: solo proyectos, ordenados por fecha.

    if (selectedProjectId === "all") {
      return ganttItems

        .filter((item) => item.type === "project")

        .sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    // Vista del proyecto seleccionado: incluye actividades, subactividades e hitos.

    const filtered = ganttItems.filter(
      (item) => item.projectId && String(item.projectId) === selectedProjectId,
    );

    const projectIdNum = Number(selectedProjectId);

    const projectRow = filtered.find((t) => t.id === `project-${projectIdNum}`);

    const activityRows = filtered

      .filter((t) => t.id.startsWith("activity-"))

      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const subRows = filtered

      .filter((t) => t.id.startsWith("subactivity-"))

      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const milestoneRows = filtered

      .filter((t) => t.id.startsWith("milestone-"))

      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const ordered: GanttTask[] = [];

    if (projectRow) ordered.push(projectRow);

    activityRows.forEach((act) => {
      const actIds = [act.activityId, act.id].filter(
        (v): v is number => typeof v === "number",
      );

      ordered.push(act);

      subRows

        .filter(
          (sub) =>
            typeof sub.activityId === "number" &&
            actIds.includes(sub.activityId),
        )

        .forEach((sub) => ordered.push(sub));

      milestoneRows

        .filter(
          (mil) =>
            typeof mil.activityId === "number" &&
            actIds.includes(mil.activityId),
        )

        .forEach((mil) => ordered.push(mil));
    });

    milestoneRows

      .filter((mil) => !mil.activityId)

      .forEach((mil) => ordered.push(mil));

    return ordered;
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
          : act,
      ),
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

        description:
          error?.response?.data?.detail ?? "No se pudo guardar el proyecto.",

        status: "error",
      });
    },
  });

  const selectedBudgetProjectId = budgetProjectFilter
    ? Number(budgetProjectFilter)
    : null;

  const budgetsQuery = useQuery({
    queryKey: ["project-budgets", selectedBudgetProjectId],
    queryFn: () =>
      selectedBudgetProjectId
        ? fetchProjectBudgets(selectedBudgetProjectId)
        : Promise.resolve([]),
    enabled: selectedBudgetProjectId !== null,
  });

  const budgetMilestonesQuery = useQuery({
    queryKey: ["project-budget-milestones", selectedBudgetProjectId],
    queryFn: () =>
      selectedBudgetProjectId
        ? fetchBudgetMilestones(selectedBudgetProjectId)
        : Promise.resolve([] as ProjectBudgetMilestone[]),
    enabled: selectedBudgetProjectId !== null,
  });

  const createBudgetMutation = useMutation({
    mutationFn: (input: {
      projectId: number;
      payload: ProjectBudgetLinePayload;
    }) => createProjectBudgetLine(input.projectId, input.payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", variables.projectId],
      });
      toast({ title: "Presupuesto guardado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar presupuesto",
        description:
          error?.response?.data?.detail ?? "No se pudo guardar el presupuesto.",
        status: "error",
      });
    },
  });

  const createBudgetMilestoneMutation = useMutation({
    mutationFn: (input: {
      projectId: number;
      payload: { name: string; order_index?: number };
    }) => createBudgetMilestone(input.projectId, input.payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", variables.projectId],
      });
      toast({ title: "Hito creado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear hito",
        description:
          error?.response?.data?.detail ?? "No se pudo crear el hito.",
        status: "error",
      });
    },
  });

  const deleteBudgetMilestoneMutation = useMutation({
    mutationFn: (input: { projectId: number; milestoneId: number }) =>
      deleteBudgetMilestone(input.projectId, input.milestoneId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", variables.projectId],
      });
      toast({ title: "Hito eliminado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al eliminar hito",
        description:
          error?.response?.data?.detail ?? "No se pudo eliminar el hito.",
        status: "error",
      });
    },
  });

  const updateBudgetMutation = useMutation({
    mutationFn: (input: {
      projectId: number;
      budgetId: number;
      payload: ProjectBudgetLineUpdatePayload;
    }) =>
      updateProjectBudgetLine(input.projectId, input.budgetId, input.payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", variables.projectId],
      });
      toast({ title: "Presupuesto actualizado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar presupuesto",
        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar el presupuesto.",
        status: "error",
      });
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (input: { projectId: number; budgetId: number }) =>
      deleteProjectBudgetLine(input.projectId, input.budgetId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", variables.projectId],
      });
      toast({ title: "Presupuesto eliminado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al eliminar presupuesto",
        description:
          error?.response?.data?.detail ??
          "No se pudo eliminar el presupuesto.",
        status: "error",
      });
    },
  });

  const budgetRows = budgetsQuery.data ?? [];
  const budgetMilestones = budgetMilestonesQuery.data ?? [];
  const hasRealBudgets = budgetRows.length > 0;
  const [budgetsEditMode, setBudgetsEditMode] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<
    Record<number, ProjectBudgetLineUpdatePayload>
  >({});
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [seedingTemplate, setSeedingTemplate] = useState(false);
  const [seedingProjectMilestones, setSeedingProjectMilestones] =
    useState(false);



  const DEFAULT_BUDGET_TEMPLATE: ProjectBudgetLine[] = useMemo(
    () => [
      {
        id: -1,
        project_id: 0,
        concept: "EQUIPOS (Amortizacion)",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -2,
        project_id: 0,
        concept: "PERSONAL",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -14,
        project_id: 0,
        concept: "Doctores",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -3,
        project_id: 0,
        concept: "Titulados universitarios",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -4,
        project_id: 0,
        concept: "No titulado",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -5,
        project_id: 0,
        concept: "MATERIAL FUNGIBLE",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -6,
        project_id: 0,
        concept: "Materiales para pruebas y ensayos",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -7,
        project_id: 0,
        concept: "COLABORACIONES EXTERNAS",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -8,
        project_id: 0,
        concept: "Centros Tecnologicos ",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -9,
        project_id: 0,
        concept: "GASTOS GENERALES (19%)",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -10,
        project_id: 0,
        concept: "OTROS GASTOS",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -11,
        project_id: 0,
        concept: "Auditoria",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: -12,
        project_id: 0,
        concept: "Dictamen acreditado ENAC de informe DNSH",
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        percent_spent: 0,
        forecasted_spent: 0,
        created_at: new Date().toISOString(),
      },
    ],
    [],
  );

  const displayBudgetRows = hasRealBudgets
    ? budgetRows
    : DEFAULT_BUDGET_TEMPLATE;

  const mergedBudgetRows = useMemo(() => {
    return displayBudgetRows.map((row) => {
      const draft = budgetDrafts[row.id];
      const h1 = draft?.hito1_budget ?? Number(row.hito1_budget ?? 0);
      const h2 = draft?.hito2_budget ?? Number(row.hito2_budget ?? 0);
      const approved_budget = draft?.approved_budget ?? h1 + h2;
      const justified_hito1 =
        draft?.justified_hito1 ?? Number(row.justified_hito1 ?? 0);
      const justified_hito2 =
        draft?.justified_hito2 ?? Number(row.justified_hito2 ?? 0);
      const forecasted_spent =
        draft?.forecasted_spent ?? Number(row.forecasted_spent ?? 0);
      const percent_spent =
        approved_budget > 0
          ? Number(((forecasted_spent / approved_budget) * 100).toFixed(2))
          : 0;
      return {
        ...row,
        ...draft,
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget,
        justified_hito1,
        justified_hito2,
        forecasted_spent,
        percent_spent,
        milestones: draft?.milestones ?? row.milestones,
      } as ProjectBudgetLine;
    });
  }, [displayBudgetRows, budgetDrafts]);

  // Agrupa por concepto para evitar repeticiones y sumar importes de subconceptos.
  const groupedBudgetRows = useMemo(() => {
    const map = new Map<string, ProjectBudgetLine>();
    const baseRows = [...mergedBudgetRows];
    // Asegura que existan filas minimas para categorias esperadas.
    DEFAULT_BUDGET_TEMPLATE.forEach((tpl) => {
      const tplKey = normalizeConceptKey(tpl.concept);
      if (
        !baseRows.some(
          (r) => normalizeConceptKey(r.concept) === tplKey,
        )
      ) {
        baseRows.push(tpl);
      }
    });

    baseRows.forEach((row) => {
      const key = normalizeConceptKey(row.concept || `row-${row.id}`);
      const current = map.get(key);
      if (!current) {
        map.set(key, { ...row });
        return;
      }
      const h1 =
        Number(current.hito1_budget ?? 0) + Number(row.hito1_budget ?? 0);
      const h2 =
        Number(current.hito2_budget ?? 0) + Number(row.hito2_budget ?? 0);
      const j1 =
        Number(current.justified_hito1 ?? 0) + Number(row.justified_hito1 ?? 0);
      const j2 =
        Number(current.justified_hito2 ?? 0) + Number(row.justified_hito2 ?? 0);
      const forecast =
        Number(current.forecasted_spent ?? 0) +
        Number(row.forecasted_spent ?? 0);
      const approved = h1 + h2;
      const percent =
        approved > 0 ? Number(((forecast / approved) * 100).toFixed(2)) : 0;
      map.set(key, {
        ...current,
        hito1_budget: h1,
        hito2_budget: h2,
        justified_hito1: j1,
        justified_hito2: j2,
        approved_budget: approved,
        forecasted_spent: forecast,
        percent_spent: percent,
      });
    });
    const ordered = Array.from(map.values());
    ordered.sort((a, b) => {
      const aKey = normalizeConceptKey(a.concept);
      const bKey = normalizeConceptKey(b.concept);
      const aIdx = BUDGET_ORDER.indexOf(aKey);
      const bIdx = BUDGET_ORDER.indexOf(bKey);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return aKey.localeCompare(bKey);
    });
    return ordered;
  }, [mergedBudgetRows]);

  const canEditBudgets = groupedBudgetRows.length > 0;

  const budgetsTabTotals = useMemo(() => {
    const totalsByMilestone: Record<
      number,
      { amount: number; justified: number }
    > = {
      1: { amount: 0, justified: 0 },
      2: { amount: 0, justified: 0 },
    };
    let approved = 0;
    let forecasted = 0;
    groupedBudgetRows.forEach((row) => {
      const h1 = Number(row.hito1_budget ?? 0);
      const h2 = Number(row.hito2_budget ?? 0);
      const j1 = Number(row.justified_hito1 ?? 0);
      const j2 = Number(row.justified_hito2 ?? 0);
      approved += h1 + h2;
      forecasted += Number(row.forecasted_spent ?? 0);
      totalsByMilestone[1].amount += h1;
      totalsByMilestone[2].amount += h2;
      totalsByMilestone[1].justified += j1;
      totalsByMilestone[2].justified += j2;
    });
    const hito1 = totalsByMilestone[1].amount;
    const hito2 = totalsByMilestone[2].amount;
    const justificados: number[] = [
      totalsByMilestone[1].justified,
      totalsByMilestone[2].justified,
    ];
    const gasto = forecasted;

    return {
      totalsByMilestone,
      approved,
      forecasted,
      hito1,
      hito2,
      justificados,
      gasto,
    };
  }, [groupedBudgetRows]);

  const budgetsDiffH1 =
    Number(budgetsTabTotals.hito1 || 0) -
    Number(budgetsTabTotals.justificados?.[0] || 0);
  const budgetsDiffH2 =
    Number(budgetsTabTotals.hito2 || 0) -
    Number(budgetsTabTotals.justificados?.[1] || 0);

  // Limpia borradores al salir del modo edicion de presupuestos.
  useEffect(() => {
    if (!budgetsEditMode) {
      setBudgetDrafts({});
    }
  }, [budgetsEditMode]);

  const seedTemplateBudgetLines = async () => {
    if (!selectedBudgetProjectId || hasRealBudgets || seedingTemplate) return;
    setSeedingTemplate(true);
    try {
      // Crea hitos por defecto si no existen
      let currentMilestones = budgetMilestones;
      if (!currentMilestones || currentMilestones.length === 0) {
        const m1 = await createBudgetMilestoneMutation.mutateAsync({
          projectId: selectedBudgetProjectId,
          payload: { name: "HITO 1", order_index: 1 },
        });
        const m2 = await createBudgetMilestoneMutation.mutateAsync({
          projectId: selectedBudgetProjectId,
          payload: { name: "HITO 2", order_index: 2 },
        });
        currentMilestones = [m1, m2];
      }

      for (const row of DEFAULT_BUDGET_TEMPLATE) {
        await createBudgetMutation.mutateAsync({
          projectId: selectedBudgetProjectId,
          payload: {
            concept: row.concept,
            hito1_budget: row.hito1_budget ?? 0,
            justified_hito1: row.justified_hito1 ?? 0,
            hito2_budget: row.hito2_budget ?? 0,
            justified_hito2: row.justified_hito2 ?? 0,
            approved_budget: (row.hito1_budget ?? 0) + (row.hito2_budget ?? 0),
            percent_spent: 0,
            forecasted_spent: 0,
          },
        });
      }
      await queryClient.invalidateQueries({
        queryKey: ["project-budgets", selectedBudgetProjectId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", selectedBudgetProjectId],
      });
      toast({ title: "Plantilla creada en el proyecto", status: "success" });
    } catch (err: any) {
      toast({
        title: "No se pudo crear la plantilla",
        description: err?.response?.data?.detail ?? "Revisa el backend.",
        status: "error",
      });
    } finally {
      setSeedingTemplate(false);
    }
  };

  // Crea hitos de presupuesto a partir de los hitos del proyecto (ERP) si no hay hitos de presupuesto.
  useEffect(() => {
    const autoSeed = async () => {
      if (
        !selectedBudgetProjectId ||
        seedingProjectMilestones ||
        budgetMilestonesQuery.isFetching ||
        (budgetMilestones && budgetMilestones.length > 0)
      ) {
        return;
      }
      const projectMilestones = milestones.filter(
        (m) => m.project_id === selectedBudgetProjectId,
      );
      if (projectMilestones.length === 0) return;
      setSeedingProjectMilestones(true);
      try {
        // Ordena por fecha si existe; si no, por id.
        const ordered = [...projectMilestones].sort((a, b) => {
          if (a.due_date && b.due_date) {
            return (
              new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
            );
          }
          return (a.id ?? 0) - (b.id ?? 0);
        });
        for (let idx = 0; idx < ordered.length; idx += 1) {
          const m = ordered[idx];
          await createBudgetMilestoneMutation.mutateAsync({
            projectId: selectedBudgetProjectId,
            payload: {
              name: m.title || `Hito ${idx + 1}`,
              order_index: idx + 1,
            },
          });
        }
        queryClient.invalidateQueries({
          queryKey: ["project-budget-milestones", selectedBudgetProjectId],
        });
      } catch (err: any) {
        toast({
          title: "No se pudieron crear los hitos de presupuesto",
          description: err?.response?.data?.detail ?? "Revisa el backend.",
          status: "error",
        });
      } finally {
        setSeedingProjectMilestones(false);
      }
    };
    autoSeed();
  }, [
    selectedBudgetProjectId,
    budgetMilestones,
    budgetMilestonesQuery.isFetching,
    milestones,
    createBudgetMilestoneMutation,
    queryClient,
    seedingProjectMilestones,
    toast,
  ]);

  const handleBudgetCellSave = (
    budgetId: number,
    field: keyof ProjectBudgetLineUpdatePayload,
    value: string,
  ) => {
    if (!selectedBudgetProjectId || budgetId <= 0) return;

    if (field === "concept") {
      const trimmed = value.trim();
      if (!trimmed) return;
      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          concept: trimmed,
        },
      }));
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    const currentRow = budgetRows.find((b) => b.id === budgetId);
  if (!currentRow) return;

  const draft = budgetDrafts[budgetId] ?? {};
  const currentH1 =
    draft.hito1_budget ?? Number(currentRow.hito1_budget ?? 0);
  const currentH2 =
    draft.hito2_budget ?? Number(currentRow.hito2_budget ?? 0);

  // Solo guardamos en borradores; el usuario confirma con un boton.
  if (field === "hito1_budget" || field === "hito2_budget") {
    const hito1 = field === "hito1_budget" ? numericValue : currentH1;
    const hito2 = field === "hito2_budget" ? numericValue : currentH2;
    const approvedBudget = hito1 + hito2;

      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          hito1_budget: hito1,
          hito2_budget: hito2,
          approved_budget: approvedBudget,
        },
      }));
      return;
    }

  if (field === "approved_budget") {
    const currentTotal = currentH1 + currentH2;
    let hito1: number;
    let hito2: number;
    if (currentTotal > 0) {
      const ratio = currentH1 / currentTotal;
      hito1 = Math.max(0, Number((numericValue * ratio).toFixed(2)));
      hito2 = Math.max(0, Number((numericValue - hito1).toFixed(2)));
    } else {
      hito1 = Number((numericValue / 2).toFixed(2));
      hito2 = Number((numericValue - hito1).toFixed(2));
    }
    const approvedBudget = hito1 + hito2;

    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
          approved_budget: approvedBudget,
          hito1_budget: hito1,
          hito2_budget: hito2,
        },
      }));
      return;
    }

    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        [field]: numericValue,
      },
    }));
  };

  const handleBudgetMilestoneChange = (
    budget: ProjectBudgetLine,
    milestoneId: number,
    field: "amount" | "justified",
    value: string,
  ) => {
    if (
      !selectedBudgetProjectId ||
      !budgetsEditMode ||
      !budget ||
      budget.id <= 0
    )
      return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const current =
      budgetDrafts[budget.id]?.milestones ?? budget.milestones ?? [];
    const updated = current.map((m) =>
      m.milestone_id === milestoneId ? { ...m, [field]: num } : m,
    );
    // Si el hito no existia en la linea, lo anadimos.
    if (!current.find((m) => m.milestone_id === milestoneId)) {
      updated.push({
        id: -1,
        milestone_id: milestoneId,
        amount: field === "amount" ? num : 0,
        justified: field === "justified" ? num : 0,
        created_at: new Date().toISOString(),
      } as any);
    }
    setBudgetDrafts((prev) => ({
      ...prev,
      [budget.id]: {
        ...(prev[budget.id] ?? {}),
        milestones: updated.map((m) => ({
          milestone_id: m.milestone_id,
          amount: m.amount,
          justified: m.justified,
        })) as any,
      },
    }));
  };

  const hasBudgetDrafts = Object.keys(budgetDrafts).length > 0;

  const handleBudgetSaveAll = async () => {
    if (!selectedBudgetProjectId || !hasBudgetDrafts) return;
    try {
      setSavingBudgets(true);

      // Validaciones por fila antes de guardar
      for (const row of mergedBudgetRows) {
        if (!budgetDrafts[row.id]) continue;
        const h1 = Number(row.hito1_budget ?? 0);
        const h2 = Number(row.hito2_budget ?? 0);
        const approved = h1 + h2;
        const j1 = Number(row.justified_hito1 ?? 0);
        const j2 = Number(row.justified_hito2 ?? 0);
        if (j1 > h1) {
          throw new Error(
            `Justificado H1 no puede superar Hito 1 en "${row.concept}".`,
          );
        }
        if (j2 > h2) {
          throw new Error(
            `Justificado H2 no puede superar Hito 2 en "${row.concept}".`,
          );
        }
        const pending = h1 + h2 - (j1 + j2);
        if (pending < 0) {
          throw new Error(
            `El justificado total supera el presupuesto aprobado en "${row.concept}".`,
          );
        }
        if (approved <= 0) {
          throw new Error(
            `El presupuesto aprobado debe ser mayor que 0 en "${row.concept}".`,
          );
        }
      }

      await Promise.all(
        Object.entries(budgetDrafts).map(([id, draftPayload]) => {
          const base = mergedBudgetRows.find((r) => r.id === Number(id));
          if (!base) return Promise.resolve();
          const h1 = Number(
            draftPayload.hito1_budget ?? base.hito1_budget ?? 0,
          );
          const h2 = Number(
            draftPayload.hito2_budget ?? base.hito2_budget ?? 0,
          );
          const approved = h1 + h2;
          const forecast = Number(
            draftPayload.forecasted_spent ?? base.forecasted_spent ?? 0,
          );
          const percent =
            approved > 0 ? Number(((forecast / approved) * 100).toFixed(2)) : 0;

          return updateProjectBudgetLine(selectedBudgetProjectId, Number(id), {
            ...draftPayload,
            hito1_budget: h1,
            hito2_budget: h2,
            approved_budget: approved,
            forecasted_spent: forecast,
            percent_spent: percent,
          });
        }),
      );
      setBudgetDrafts({});
      await queryClient.invalidateQueries({
        queryKey: ["project-budgets", selectedBudgetProjectId],
      });
      toast({ title: "Presupuestos guardados", status: "success" });
    } catch (error: any) {
      toast({
        title: "Error al guardar presupuestos",
        description:
          error?.message ??
          error?.response?.data?.detail ??
          "No se pudieron guardar los cambios de la tabla.",
        status: "error",
      });
    } finally {
      setSavingBudgets(false);
    }
  };

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetModalMode, setBudgetModalMode] =
    useState<BudgetModalMode>("create");
  const [budgetModalInitial, setBudgetModalInitial] =
    useState<ProjectBudgetLinePayload>(DEFAULT_BUDGET_PAYLOAD);
  const [activeBudgetLine, setActiveBudgetLine] =
    useState<ProjectBudgetLine | null>(null);

  const openBudgetModal = (mode: BudgetModalMode, line?: ProjectBudgetLine) => {
    setBudgetModalMode(mode);
    if (line) {
      setBudgetModalInitial({
        concept: line.concept,
        hito1_budget: line.hito1_budget,
        justified_hito1: line.justified_hito1,
        hito2_budget: line.hito2_budget,
        justified_hito2: line.justified_hito2,
        approved_budget: line.approved_budget,
        percent_spent: line.percent_spent,
        forecasted_spent: line.forecasted_spent,
      });
      setActiveBudgetLine(line);
    } else {
      setBudgetModalInitial(DEFAULT_BUDGET_PAYLOAD);
      setActiveBudgetLine(null);
    }
    setBudgetModalOpen(true);
  };

  const handleBudgetSave = (payload: ProjectBudgetLinePayload) => {
    if (!payload.concept.trim()) {
      toast({ title: "Concepto requerido", status: "warning" });
      return;
    }
    if (selectedBudgetProjectId === null) {
      toast({ title: "Selecciona un proyecto", status: "warning" });
      return;
    }
    const projectId = selectedBudgetProjectId;
    if (budgetModalMode === "edit" && activeBudgetLine) {
      updateBudgetMutation.mutate(
        {
          projectId,
          budgetId: activeBudgetLine.id,
          payload,
        },
        {
          onSuccess: () => setBudgetModalOpen(false),
        },
      );
      return;
    }
    createBudgetMutation.mutate(
      { projectId, payload },
      {
        onSuccess: () => setBudgetModalOpen(false),
      },
    );
  };

  const handleBudgetDelete = (budgetId: number) => {
    if (selectedBudgetProjectId === null) return;
    deleteBudgetMutation.mutate({
      projectId: selectedBudgetProjectId,
      budgetId,
    });
  };

  // Mutaciones de edicion en cascada para actividad, subactividad e hito.

  const updateActivityMutation = useMutation({
    mutationFn: async (input: {
      id: number;

      payload: Parameters<typeof updateActivity>[1];
    }) => updateActivity(input.id, input.payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-activities"] });

      toast({ title: "Actividad actualizada", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar actividad",

        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar la actividad.",

        status: "error",
      });
    },
  });

  const updateSubActivityMutation = useMutation({
    mutationFn: async (input: {
      id: number;

      payload: Parameters<typeof updateSubActivity>[1];
    }) => updateSubActivity(input.id, input.payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-subactivities"] });

      toast({ title: "Subactividad actualizada", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar subactividad",

        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar la subactividad.",

        status: "error",
      });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async (input: {
      id: number;

      payload: Parameters<typeof updateMilestone>[1];
    }) => updateMilestone(input.id, input.payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-milestones"] });

      toast({ title: "Hito actualizado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar hito",

        description:
          error?.response?.data?.detail ?? "No se pudo actualizar el hito.",

        status: "error",
      });
    },
  });

  const createAllocationMutation = useMutation({
    mutationFn: createEmployeeAllocation,

    onSuccess: (created) => {
      queryClient.setQueryData<EmployeeAllocation[]>(
        ["hr-allocations", summaryYear],

        (prev = []) => [...prev.filter((a) => a.id !== created.id), created],
      );

      toast({
        title: "Horas asignadas",

        description: "La asignacion se guardo correctamente.",

        status: "success",

        duration: 2400,

        isClosable: true,
      });
    },

    onError: () => {
      toast({
        title: "Error al asignar horas",

        description: "Revisa los datos e intentalo de nuevo.",

        status: "error",
      });
    },
  });

  const updateAllocationMutation = useMutation({
    mutationFn: ({
      allocationId,

      data,
    }: {
      allocationId: number;

      data: Partial<EmployeeAllocation>;
    }) => updateEmployeeAllocation(allocationId, data),

    onSuccess: (updated) => {
      queryClient.setQueryData<EmployeeAllocation[]>(
        ["hr-allocations", summaryYear],

        (prev = []) => prev.map((a) => (a.id === updated.id ? updated : a)),
      );

      toast({
        title: "Asignacion actualizada",

        status: "success",

        duration: 2000,

        isClosable: true,
      });
    },

    onError: () => {
      toast({
        title: "No se pudo actualizar la asignacion",

        status: "error",
      });
    },
  });

  // Elimina proyecto seleccionado.

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("No hay proyecto seleccionado");
      }

      return deleteErpProject(selectedProject.id);
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });

      setSelectedProject(null);

      setDetailsOpen(false);

      toast({ title: "Proyecto eliminado", status: "success" });
    },

    onError: async (error: any) => {
      // Fallback: si el backend no permite DELETE (405), intenta desactivar el proyecto.

      if (error?.response?.status === 405 && selectedProject) {
        try {
          await updateErpProject(selectedProject.id, { is_active: false });

          await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });

          toast({
            title: "Proyecto desactivado",

            description:
              "El backend no permite eliminar; se marc+ como inactivo.",

            status: "info",
          });

          setSelectedProject(null);

          setDetailsOpen(false);

          return;
        } catch (fallbackError: any) {
          toast({
            title: "Error al desactivar",

            description:
              fallbackError?.response?.data?.detail ??
              "No se pudo desactivar el proyecto despu+s del 405.",

            status: "error",
          });

          return;
        }
      }

      toast({
        title: "Error al eliminar",

        description:
          error?.response?.data?.detail ?? "No se pudo eliminar el proyecto.",

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

        description:
          error?.response?.data?.detail ?? "No se pudo actualizar el proyecto.",

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

  // Guarda edicion del proyecto actual.

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

  const handleDeleteProject = () => {
    if (!selectedProject) {
      toast({ title: "Selecciona un proyecto", status: "warning" });

      return;
    }

    deleteProjectMutation.mutate();
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

  const departmentMap = useMemo(() => {
    const map: Record<number, string> = {};

    hrDepartments.forEach((dept) => {
      map[dept.id] = dept.name;
    });

    return map;
  }, [hrDepartments]);

  const departmentColorMap = useMemo<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    hrDepartments.forEach((dept, idx) => {
      map[dept.id] =
        DEPARTMENT_COLOR_SCHEMES[idx % DEPARTMENT_COLOR_SCHEMES.length] ??
        "gray";
    });
    return map;
  }, [hrDepartments]);

  useEffect(() => {
    if (hrEmployees.length === 0) return;
    setSelectedEmployeeIds((prev) => {
      if (prev.length === 0) {
        return hrEmployees.map((emp) => emp.id);
      }
      const next = new Set(prev);
      let changed = false;
      hrEmployees.forEach((emp) => {
        if (!next.has(emp.id)) {
          next.add(emp.id);
          changed = true;
        }
      });
      return changed ? Array.from(next) : prev;
    });
  }, [hrEmployees]);

  const departmentAllocationPercentMap = useMemo<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    hrDepartments.forEach((dept) => {
      map[dept.id] = Number(dept.project_allocation_percentage ?? 100);
    });
    return map;
  }, [hrDepartments]);

  const allocationKey = (
    employeeId: number,

    projectId?: number | null,

    year?: number | null,

    milestone?: string | null,
  ) =>
    `${employeeId}-${projectId ?? "none"}-${year ?? ""}-${milestone ?? "default"}`;

  const allocationIndex = useMemo(() => {
    const map = new Map<string, EmployeeAllocation>();

    allocations.forEach((a) => {
      const key = allocationKey(
        a.employee_id,
        a.project_id,
        a.year,
        a.milestone ?? "Sin hitos",
      );
      map.set(key, a);
    });

    return map;
  }, [allocations]);

  const projectColumns = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,

        name: p.name ?? `Proyecto ${p.id}`,
      })),

    [projects],
  );

  const employeeAvailability = useMemo(() => {
    const map: Record<number, number> = {};

    hrEmployees.forEach((emp) => {
      const base = Number(emp.available_hours ?? 0);

      const pct = Number(emp.availability_percentage ?? 100);

      const available =
        Number.isFinite(base) && Number.isFinite(pct)
          ? Math.max(0, Math.round(base * (pct / 100)))
          : 0;

      map[emp.id] = available;
    });

    return map;
  }, [hrEmployees]);

  const employeeDepartmentPercentages = useMemo(() => {
    const records: Record<number, Record<number, number>> = {};

    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.employee_id || !alloc.department_id) return;
      const hours = Number(alloc.allocated_hours ?? 0);
      const employeeRecords = records[alloc.employee_id] ?? {};
      employeeRecords[alloc.department_id] =
        (employeeRecords[alloc.department_id] ?? 0) + hours;
      records[alloc.employee_id] = employeeRecords;
    });

    const result: Record<
      number,
      Array<{
        departmentId: number;
        departmentName: string;
        limitPercent: number;
        usedPercent: number;
        limitHours: number;
        usedHours: number;
      }>
    > = {};

    Object.entries(records).forEach(([employeeIdStr, deptMap]) => {
      const employeeId = Number(employeeIdStr);
      const available = employeeAvailability[employeeId] ?? 0;
      const list = Object.entries(deptMap)
        .map(([deptIdStr, hours]) => {
          const deptId = Number(deptIdStr);
          const limitPercent = departmentAllocationPercentMap[deptId] ?? 100;
          const limitHours = Math.round((available * limitPercent) / 100);
          const usedPercent =
            limitHours > 0 ? Math.round((hours / limitHours) * 100) : 0;
          return {
            departmentId: deptId,
            departmentName: departmentMap[deptId] ?? "Sin departamento",
            limitPercent,
            usedPercent,
            limitHours,
            usedHours: Math.round(hours),
          };
        })
        .sort((a, b) => b.usedPercent - a.usedPercent);
      result[employeeId] = list;
    });

    return result;
  }, [
    allocations,
    summaryYear,
    employeeAvailability,
    departmentMap,
    departmentAllocationPercentMap,
  ]);

  const employeeNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    hrEmployees.forEach((emp) => {
      map[emp.id] = emp.full_name?.trim() || "Empleado";
    });
    return map;
  }, [hrEmployees]);

  const milestoneContributions = useMemo(() => {
    const map: Record<
      number,
      Record<string, Array<{ name: string; hours: number }>>
    > = {};
    allocations.forEach((alloc) => {
      if (!alloc.project_id || alloc.year !== summaryYear) return;
      const name = employeeNameMap[alloc.employee_id] ?? `${alloc.employee_id}`;
      const label = alloc.milestone || "Sin hitos";
      const projectMap = map[alloc.project_id] ?? {};
      const list = projectMap[label] ?? [];
      const existing = list.find((entry) => entry.name === name);
      if (existing) {
        existing.hours += Number(alloc.allocated_hours ?? 0);
      } else {
        list.push({ name, hours: Number(alloc.allocated_hours ?? 0) });
      }
      projectMap[label] = list;
      map[alloc.project_id] = projectMap;
    });
    return map;
  }, [allocations, summaryYear, employeeNameMap]);

  const projectTotals = useMemo(() => {
    const totals: Record<number, number> = {};

    allocations.forEach((a) => {
      if (!a.project_id) return;

      totals[a.project_id] =
        (totals[a.project_id] ?? 0) + Number(a.allocated_hours ?? 0);
    });

    return totals;
  }, [allocations]);

  const employeeMilestoneHours = useMemo(() => {
    const map: Record<number, Record<number, Record<string, number>>> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.employee_id || !alloc.project_id) return;
      const employeeMap = map[alloc.employee_id] ?? {};
      const projectMap = employeeMap[alloc.project_id] ?? {};
      const milestoneLabel = alloc.milestone || "Sin hitos";
      projectMap[milestoneLabel] =
        (projectMap[milestoneLabel] ?? 0) + Number(alloc.allocated_hours ?? 0);
      employeeMap[alloc.project_id] = projectMap;
      map[alloc.employee_id] = employeeMap;
    });
    return map;
  }, [allocations, summaryYear]);

  useEffect(() => {
    if (projectColumns.length === 0) return;

    setProjectJustify((prev) => {
      const next = { ...prev };

      projectColumns.forEach((p) => {
        if (next[p.id] === undefined) next[p.id] = projectTotals[p.id] ?? 0;
      });

      return next;
    });

    setProjectJustified(() => {
      const next: Record<number, number> = {};

      projectColumns.forEach((p) => {
        next[p.id] = projectTotals[p.id] ?? 0;
      });

      return next;
    });

    setSummaryMilestones((prev) => {
      const next = { ...prev };

      projectColumns.forEach((p) => {
        if (next[p.id] === undefined) next[p.id] = [];
      });

      return next;
    });
  }, [projectColumns, projectTotals]);

  const totalAvailableHours = useMemo(
    () => Object.values(employeeAvailability).reduce((sum, v) => sum + v, 0),

    [employeeAvailability],
  );

  const totalAllocatedHours = useMemo(
    () =>
      allocations.reduce((sum, a) => sum + Number(a.allocated_hours ?? 0), 0),

    [allocations],
  );

  const filteredSummaryEmployees = useMemo(() => {
    const searchLower = summarySearch.toLowerCase();
    return hrEmployees.filter((emp) => {
      if (!selectedEmployeeIds.includes(emp.id)) return false;
      const matchesName = (emp.full_name || "")
        .toLowerCase()
        .includes(searchLower);
      const matchesDepartment =
        departmentFilter === "all"
          ? true
          : emp.primary_department_id === departmentFilter;
      return matchesName && matchesDepartment;
    });
  }, [hrEmployees, summarySearch, selectedEmployeeIds, departmentFilter]);

  const employeesAvailableToAdd = useMemo(() => {
    const searchLower = addDrawerSearch.toLowerCase();
    return hrEmployees.filter((emp) => {
      if (selectedEmployeeIds.includes(emp.id)) return false;
      if (
        addDrawerDeptFilter !== "all" &&
        emp.primary_department_id !== addDrawerDeptFilter
      ) {
        return false;
      }
      return (emp.full_name || "").toLowerCase().includes(searchLower);
    });
  }, [hrEmployees, selectedEmployeeIds, addDrawerDeptFilter, addDrawerSearch]);

  const handleAddEmployee = (employeeId: number) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev : [...prev, employeeId],
    );
    onCloseAddModal();
  };

  const handleAllocationBlur = (
    employee: EmployeeProfile,

    projectId: number,

    milestoneLabel: string,

    value: string,
  ) => {
    if (!summaryEditMode) return;
    const key = allocationKey(
      employee.id,
      projectId,
      summaryYear,
      milestoneLabel,
    );

    const parsed = Number(value || 0);

    const safeValue = Number.isFinite(parsed) ? parsed : 0;

    const existing = allocationIndex.get(key);

    if (existing) {
      updateAllocationMutation.mutate({
        allocationId: existing.id,

        data: {
          allocated_hours: safeValue,

          project_id: projectId,

          employee_id: existing.employee_id,

          department_id:
            employee.primary_department_id ?? existing.department_id ?? null,

          year: summaryYear,

          milestone: milestoneLabel,
        },
      });
    } else {
      createAllocationMutation.mutate({
        tenant_id: employee.tenant_id,

        employee_id: employee.id,

        department_id: employee.primary_department_id ?? null,

        project_id: projectId,

        milestone: milestoneLabel,

        year: summaryYear,

        allocated_hours: safeValue,

        notes: null,
      });
    }

    setAllocationEdits((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleAllocationChange = (
    employeeId: number,

    projectId: number,

    milestoneLabel: string,

    value: string,
  ) => {
    if (!summaryEditMode) return;
    const key = allocationKey(
      employeeId,
      projectId,
      summaryYear,
      milestoneLabel,
    );
    setAllocationEdits((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  //////////////////////////////////////Render principal./////////////////////////////////////////////////////////////////////////////

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
            <Heading size="lg">Gestion de Proyectos</Heading>

            <Text color="whiteAlpha.800">
              Control y visualizacion de proyectos y tareas
            </Text>
          </Stack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {heroItems.map((item) => (
              <Box key={item.label} p={4} borderRadius="lg" bg="whiteAlpha.100">
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color="whiteAlpha.800"
                >
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

      {/* Navegacion por pestanas: resumen, tarjetas, Gantt y creacion */}

      <Tabs
        variant="line"
        colorScheme="green"
        isLazy
        index={activeTab}
        onChange={setActiveTab}
      >
        <TabList borderBottomWidth="1px">
          <Tab>Resumen</Tab>

          <Tab>Proyectos</Tab>

          <Tab>Diagrama de Gantt</Tab>

          <Tab>Presupuestos</Tab>

          <Tab>Crear</Tab>
        </TabList>

        <TabPanels mt={4}>
          {/* Resumen editable tipo Excel: horas por empleado y proyecto */}

          <TabPanel px={0} minW="0" overflowX="hidden">
            <Stack spacing={5} minW="0">
              <Flex
                align="center"
                justify="space-between"
                gap={4}
                flexWrap="wrap"
              >
                <Box>
                  <Heading size="md" mb={1}>
                    Gestion y seguimiento de proyectos
                  </Heading>
                  <HStack spacing={2} mb={1}>
                    <Tag colorScheme="green" size="sm">
                      Ano {summaryYear}
                    </Tag>
                    <Text fontSize="xs" color={subtleText}>
                      Filtrando por ano {summaryYear}
                    </Text>
                  </HStack>
                  <Text fontSize="sm" color={subtleText}>
                    Tablero tipo Excel con horas a justificar, justificadas y
                    asignacion por empleado.
                  </Text>
                  {loadingSummaryYear && (
                    <Text fontSize="xs" color={subtleText} mt={1}>
                      Cargando los datos del ano {summaryYear}...
                    </Text>
                  )}
                  {saveStatusLabel && !loadingSummaryYear && (
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      {saveStatusLabel}
                    </Text>
                  )}
                </Box>

                <HStack spacing={3} align="flex-end" flexWrap="wrap">
                  <FormControl maxW="220px">
                    <FormLabel fontSize="xs" mb={1}>
                      Buscar empleado
                    </FormLabel>

                    <Input
                      size="sm"
                      placeholder="Nombre o apellidos"
                      value={summarySearch}
                      onChange={(e) => setSummarySearch(e.target.value)}
                    />
                  </FormControl>

                  <FormControl maxW="180px">
                    <FormLabel fontSize="xs" mb={1}>
                      Departamento
                    </FormLabel>
                    <Select
                      size="sm"
                      value={departmentFilter}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDepartmentFilter(
                          value === "all" ? "all" : Number(value),
                        );
                      }}
                    >
                      <option value="all">Todos</option>
                      {hrDepartments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl maxW="120px">
                    <FormLabel fontSize="xs" mb={1}>
                      Ano
                    </FormLabel>

                    <Select
                      size="sm"
                      value={summaryYear}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        setSummaryYear(
                          Number.isFinite(parsed)
                            ? parsed
                            : new Date().getFullYear(),
                        );
                      }}
                    >
                      {YEAR_FILTER_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  <Button
                    size="sm"
                    colorScheme="green"
                    variant="solid"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: ["hr-allocations", summaryYear, hrTenantId],
                      })
                    }
                  >
                    Refrescar
                  </Button>

                  <Button
                    size="sm"
                    variant={summaryEditMode ? "solid" : "outline"}
                    colorScheme={summaryEditMode ? "green" : "gray"}
                    onClick={() => setSummaryEditMode((v) => !v)}
                  >
                    {summaryEditMode ? "Guardar" : "Editar"}
                  </Button>
                </HStack>
                <Flex wrap="wrap" gap={3} mt={2} mb={4}>
                  {hrDepartments.map((dept) => (
                    <HStack key={`legend-${dept.id}`} spacing={2}>
                      <Box
                        w="12px"
                        h="12px"
                        borderRadius="full"
                        bg={departmentColorMap[dept.id] ?? "gray.300"}
                      />
                      <Text fontSize="xs" color="gray.600">
                        {dept.name}
                      </Text>
                    </HStack>
                  ))}
                </Flex>
              </Flex>

              <Box
                borderWidth="1px"
                borderRadius="xl"
                bg="white"
                boxShadow="md"
                w="100%"
                maxW="100%"
                minW="0"
                overflow="hidden"
              >
                <Box
                  w="100%"
                  maxW="100%"
                  minW="0"
                  overflowX="auto"
                  overflowY="hidden"
                >
                  <Table
                    size="sm"
                    variant="simple"
                    minW="1400px"
                    w="max-content"
                  >
                    <Thead>
                      <Tr bg="gray.200">
                        <Th minW="60px">No</Th>

                        <Th minW="170px">Nombre</Th>

                        <Th minW="190px">Apellidos</Th>

                        <Th minW="130px">Departamento</Th>

                        {projectColumns.map((p) => {
                          const count =
                            (summaryMilestones[p.id] ?? []).length || 1;
                          return (
                            <Th
                              key={p.id}
                              colSpan={count}
                              textAlign="center"
                              bg="gray.200"
                              borderColor="gray.300"
                            >
                              <HStack spacing={2} justify="center">
                                <Text fontWeight="semibold">{p.name}</Text>
                                <Button
                                  size="xs"
                                  colorScheme="green"
                                  variant="solid"
                                  borderRadius="full"
                                  onClick={() => addMilestoneRow(p.id)}
                                  aria-label={`Anadir hito a ${p.name}`}
                                  minW="22px"
                                  h="22px"
                                  p={0}
                                >
                                  +
                                </Button>
                              </HStack>
                            </Th>
                          );
                        })}

                        <Th
                          textAlign="center"
                          bg="green.700"
                          color="white"
                          minW="140px"
                        >
                          TOTAL HORAS JUSTIFICADAS
                        </Th>

                        <Th textAlign="center" bg="gray.50" minW="90px">
                          I+D 100%
                        </Th>

                        <Th textAlign="center" bg="gray.50" minW="90px">
                          Estudio 50%
                        </Th>

                        <Th textAlign="center" bg="gray.50" minW="110px">
                          Jefes de obra 30%
                        </Th>

                        <Th textAlign="center" bg="gray.50" minW="110px">
                          Limites especiales
                        </Th>

                        <Th
                          textAlign="center"
                          bg="red.600"
                          color="white"
                          minW="150px"
                        >
                          Horas disponibles para {summaryYear}
                        </Th>
                      </Tr>

                      <Tr bg="gray.50" borderBottomWidth="1px">
                        <Th bg="gray.50" colSpan={4} textAlign="left">
                          Horas a justificar
                        </Th>

                        {projectColumns.map((p) => {
                          const count =
                            (summaryMilestones[p.id] ?? []).length || 1;
                          return (
                            <Th
                              key={p.id}
                              textAlign="center"
                              borderColor="gray.200"
                              colSpan={count}
                            >
                              <Input
                                size="xs"
                                type="number"
                                value={projectJustify[p.id] ?? 0}
                                onChange={(e) =>
                                  setProjectJustify((prev) => ({
                                    ...prev,

                                    [p.id]: Number(e.target.value || 0),
                                  }))
                                }
                                textAlign="center"
                                px={2}
                                py={1}
                              />
                            </Th>
                          );
                        })}

                        <Th textAlign="center" bg="green.50">
                          {Object.values(projectJustified).reduce(
                            (a, b) => a + (b || 0),

                            0,
                          )}{" "}
                          h
                        </Th>

                        <Th colSpan={5} />
                      </Tr>

                      <Tr bg="green.50" borderBottomWidth="1px">
                        <Th bg="gray.50" colSpan={4} textAlign="left">
                          Justificadas
                        </Th>

                        {projectColumns.map((p) => {
                          const count =
                            (summaryMilestones[p.id] ?? []).length || 1;
                          return (
                            <Th
                              key={p.id}
                              textAlign="center"
                              borderColor="gray.200"
                              colSpan={count}
                            >
                              <Input
                                size="xs"
                                type="number"
                                value={projectJustified[p.id] ?? 0}
                                isReadOnly
                                focusBorderColor="green.400"
                                textAlign="center"
                                px={2}
                                py={1}
                              />
                            </Th>
                          );
                        })}

                        <Th textAlign="center" bg="green.700" color="white">
                          Justificadas totales
                        </Th>

                        <Th colSpan={5} />
                      </Tr>

                      <Tr bg="orange.50" borderBottomWidth="1px">
                        <Th bg="orange.50" colSpan={4} textAlign="left">
                          Faltan
                        </Th>

                        {projectColumns.map((p) => {
                          const count =
                            (summaryMilestones[p.id] ?? []).length || 1;
                          const falt =
                            (projectJustify[p.id] ?? 0) -
                            (projectJustified[p.id] ?? 0);

                          return (
                            <Th
                              key={p.id}
                              textAlign="center"
                              color={falt > 0 ? "orange.600" : "green.600"}
                              colSpan={count}
                            >
                              {falt} h
                            </Th>
                          );
                        })}

                        <Th textAlign="center" bg="orange.50" />

                        <Th colSpan={5} />
                      </Tr>

                      <Tr
                        bg="blue.100"
                        borderBottomWidth="2px"
                        borderColor="blue.200"
                      >
                        <Th
                          bg="blue.100"
                          colSpan={4}
                          textAlign="left"
                          color="blue.700"
                        >
                          % Ejecutado en {summaryYear}
                        </Th>

                        {projectColumns.map((p) => {
                          const count =
                            (summaryMilestones[p.id] ?? []).length || 1;
                          const justify = projectJustify[p.id] ?? 0;

                          const just = projectJustified[p.id] ?? 0;

                          const pct =
                            justify > 0
                              ? Math.round((just / justify) * 100)
                              : 0;

                          return (
                            <Th
                              key={p.id}
                              textAlign="center"
                              color="blue.700"
                              colSpan={count}
                            >
                              {pct}%
                            </Th>
                          );
                        })}

                        <Th colSpan={6} />
                      </Tr>

                      <Tr
                        bg="green.50"
                        borderBottomWidth="2px"
                        borderColor="green.200"
                      >
                        <Th
                          bg="green.50"
                          colSpan={4}
                          textAlign="left"
                          color="green.700"
                        >
                          Hitos (H1/H2/H3/H4)
                        </Th>

                        {projectColumns.map((p) => {
                          const ms = summaryMilestones[p.id] ?? [];
                          if (ms.length === 0) {
                            return (
                              <Th
                                key={`${p.id}-ms-empty`}
                                textAlign="center"
                                color="green.800"
                              >
                                <Text fontSize="xs" color="teal.600">
                                  Anade hitos con el +
                                </Text>
                              </Th>
                            );
                          }

                          return ms.map((item, idx) => (
                            <Th
                              key={`${p.id}-ms-${idx}`}
                              textAlign="center"
                              p={2}
                            >
                              <HStack justify="center" spacing={1}>
                                <Text fontSize="xs" fontWeight="semibold">
                                  {item.label || `H${idx + 1}`}
                                </Text>

                                <Button
                                  size="xs"
                                  variant="ghost"
                                  colorScheme="red"
                                  p={0}
                                  minW="18px"
                                  h="18px"
                                  onClick={() =>
                                    setSummaryMilestones((prev) => {
                                      const list = prev[p.id] ?? [];
                                      const next = list.filter(
                                        (_, mIdx) => mIdx !== idx,
                                      );
                                      return { ...prev, [p.id]: next };
                                    })
                                  }
                                >
                                  <Text fontSize="xs">x</Text>
                                </Button>
                              </HStack>
                            </Th>
                          ));
                        })}

                        <Th colSpan={6} />
                      </Tr>
                    </Thead>

                    <Tbody>
                      {filteredSummaryEmployees.length === 0 ? (
                        <Tr>
                          <Td
                            colSpan={projectColumns.length + 9}
                            textAlign="center"
                            color={subtleText}
                            py={6}
                          >
                            No hay empleados registrados en RRHH.
                          </Td>
                        </Tr>
                      ) : (
                        filteredSummaryEmployees.map((emp, idx) => {
                          const available = employeeAvailability[emp.id] ?? 0;
                          const deptId = emp.primary_department_id ?? -1;
                          const deptColor =
                            departmentColorMap[deptId] ?? "gray";
                          const bgColor =
                            idx % 2 === 0
                              ? `${deptColor}.50`
                              : `${deptColor}.100`;

                          let totalEmpAllocated = 0;

                          return (
                            <Tr
                              key={emp.id}
                              bg={bgColor}
                              borderLeftWidth="3px"
                              borderLeftColor={`${deptColor}.500`}
                            >
                              <Td bg={bgColor}>{idx + 1}</Td>

                              <Td bg={bgColor} fontWeight="semibold">
                                {emp.full_name?.split(" ")[0] ?? "Sin nombre"}
                              </Td>

                              <Td bg={bgColor}>
                                {emp.full_name?.split(" ").slice(1).join(" ") ||
                                  "-"}
                              </Td>

                              <Td bg={bgColor} minW="180px" px={2}>
                                <Flex align="center" gap={2}>
                                  <Box
                                    w="12px"
                                    h="12px"
                                    borderRadius="full"
                                    bg={
                                      departmentColorMap[
                                        emp.primary_department_id ?? -1
                                      ] ?? "gray.300"
                                    }
                                  />
                                  <VStack align="flex-start" spacing={0}>
                                    <Text fontSize="sm" fontWeight="semibold">
                                      {departmentMap[
                                        emp.primary_department_id ?? -1
                                      ] ?? "Sin departamento"}
                                    </Text>
                                    {(() => {
                                      const usage =
                                        (
                                          employeeDepartmentPercentages[
                                            emp.id
                                          ] ?? []
                                        ).find(
                                          (entry) =>
                                            entry.departmentId ===
                                            emp.primary_department_id,
                                        ) ??
                                        employeeDepartmentPercentages[
                                          emp.id
                                        ]?.[0];
                                      if (!usage) return null;
                                      return (
                                        <Text
                                          fontSize="xx-small"
                                          color="gray.500"
                                        >
                                          {usage.usedPercent}% usado /{" "}
                                          {usage.limitPercent}% cuota (
                                          {usage.usedHours}h/
                                          {usage.limitHours}h)
                                        </Text>
                                      );
                                    })()}
                                  </VStack>
                                </Flex>
                              </Td>

                              {projectColumns.map((p) => {
                                const count =
                                  (summaryMilestones[p.id] ?? []).length || 1;
                                const key = allocationKey(
                                  emp.id,

                                  p.id,

                                  summaryYear,
                                );

                                const existing = allocationIndex.get(key);

                                const value =
                                  allocationDraftsState[key] ??
                                  existing?.allocated_hours?.toString() ??
                                  "";

                                const numericValue = Number(
                                  value || existing?.allocated_hours || 0,
                                );

                                totalEmpAllocated += Number.isFinite(
                                  numericValue,
                                )
                                  ? numericValue
                                  : 0;

                                if (count === 0) {
                                  return (
                                    <Td
                                      key={`${emp.id}-${p.id}-empty`}
                                      textAlign="center"
                                    >
                                      -
                                    </Td>
                                  );
                                }

                                const cells: JSX.Element[] = [];

                                for (let mIdx = 0; mIdx < count; mIdx += 1) {
                                  const milestoneLabel =
                                    summaryMilestones[p.id]?.[mIdx]?.label ??
                                    `H${mIdx + 1}`;

                                  const cellKey = allocationKey(
                                    emp.id,
                                    p.id,
                                    summaryYear,
                                    milestoneLabel,
                                  );
                                  const cellExisting =
                                    allocationIndex.get(cellKey);
                                  const cellValue =
                                    allocationDraftsState[cellKey] ??
                                    cellExisting?.allocated_hours?.toString() ??
                                    "";

                                  cells.push(
                                    <Td
                                      key={`${emp.id}-${p.id}-${mIdx}`}
                                      textAlign="center"
                                    >
                                      {summaryEditMode ? (
                                        <Input
                                          size="sm"
                                          type="number"
                                          min={0}
                                          value={cellValue}
                                          onChange={(e) =>
                                            setAllocationDrafts((prev) => ({
                                              ...prev,

                                              [cellKey]: e.target.value,
                                            }))
                                          }
                                          onBlur={(e) =>
                                            handleAllocationBlur(
                                              emp,

                                              p.id,

                                              milestoneLabel,

                                              e.target.value,
                                            )
                                          }
                                          textAlign="center"
                                        />
                                      ) : (
                                        <Text>
                                          {cellExisting?.allocated_hours ?? 0} h
                                        </Text>
                                      )}
                                    </Td>,
                                  );
                                }

                                return cells;
                              })}

                              <Td
                                textAlign="center"
                                fontWeight="bold"
                                color="white"
                                bg="green.700"
                              >
                                {totalEmpAllocated} h
                              </Td>

                              <Td textAlign="center" bg="white">
                                -
                              </Td>

                              <Td textAlign="center" bg="white">
                                -
                              </Td>

                              <Td textAlign="center" bg="white">
                                -
                              </Td>

                              <Td textAlign="center" bg="white">
                                -
                              </Td>

                              <Td
                                textAlign="center"
                                bg={
                                  available - totalEmpAllocated < 0
                                    ? "red.50"
                                    : "green.50"
                                }
                                color={
                                  available - totalEmpAllocated < 0
                                    ? "red.700"
                                    : "green.700"
                                }
                                fontWeight="semibold"
                              >
                                {available - totalEmpAllocated} h
                              </Td>
                            </Tr>
                          );
                        })
                      )}
                    </Tbody>
                  </Table>
                </Box>

                {/* Contenedor de la tabla (scroll horizontal solo aqui) */}
              </Box>

              <Modal
                isOpen={isAddModalOpen}
                onClose={onCloseAddModal}
                size="md"
              >
                <ModalOverlay />
                <ModalContent>
                  <ModalHeader>Agregar empleados</ModalHeader>
                  <ModalBody>
                    <Stack spacing={3}>
                      {/* Debug info */}
                      <Box
                        p={2}
                        bg="gray.100"
                        borderRadius="md"
                        fontSize="xs"
                        display="none"
                      >
                        <Text>Tenant ID: {hrTenantId ?? "undefined"}</Text>
                        <Text>Empleados cargados: {hrEmployees.length}</Text>
                        <Text>
                          Departamentos cargados: {hrDepartments.length}
                        </Text>
                        <Text>
                          Empleados seleccionados: {selectedEmployeeIds.length}
                        </Text>
                        <Text>
                          Cargando empleados: {employeesLoading ? "si" : "no"}
                        </Text>
                        <Text>
                          Cargando depts: {departmentsLoading ? "si" : "no"}
                        </Text>
                      </Box>

                      {(employeesLoading || departmentsLoading) && (
                        <Box
                          p={3}
                          bg="blue.50"
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor="blue.200"
                        >
                          <Text fontSize="xs" color="blue.800">
                            ? Cargando empleados y departamentos...
                          </Text>
                        </Box>
                      )}

                      {(employeesError || departmentsError) && (
                        <Box
                          p={3}
                          bg="red.50"
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor="red.200"
                        >
                          <Text fontSize="xs" color="red.800" fontWeight="bold">
                            ?? Error al cargar datos
                          </Text>
                          {employeesError && (
                            <Text fontSize="xs" color="red.700" mt={1}>
                              Error cargando empleados:{" "}
                              {employeesErrorMsg?.toString() || "Desconocido"}
                            </Text>
                          )}
                          {departmentsError && (
                            <Text fontSize="xs" color="red.700" mt={1}>
                              Error cargando departamentos:{" "}
                              {departmentsErrorMsg?.toString() || "Desconocido"}
                            </Text>
                          )}
                          <Button
                            size="xs"
                            mt={2}
                            colorScheme="red"
                            onClick={() => {
                              queryClient.invalidateQueries({
                                queryKey: ["hr-employees", hrTenantId],
                              });
                              queryClient.invalidateQueries({
                                queryKey: ["hr-departments", hrTenantId],
                              });
                            }}
                          >
                            Reintentar
                          </Button>
                        </Box>
                      )}

                      {!employeesError &&
                        !departmentsError &&
                        hrDepartments.length === 0 &&
                        hrEmployees.length === 0 && (
                          <Box
                            p={3}
                            bg="orange.50"
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor="orange.200"
                          >
                            <Text fontSize="xs" color="orange.800">
                              ?? Cargando datos de departamentos y empleados...
                            </Text>
                            <Button
                              size="xs"
                              mt={2}
                              colorScheme="orange"
                              onClick={() => {
                                queryClient.invalidateQueries({
                                  queryKey: ["hr-employees", hrTenantId],
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["hr-departments", hrTenantId],
                                });
                              }}
                            >
                              Recargar datos
                            </Button>
                          </Box>
                        )}

                      {/* Leyenda de departamentos */}
                      {hrDepartments.length > 0 && (
                        <Box
                          p={3}
                          bg="gray.50"
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor="gray.200"
                        >
                          <Text fontSize="xs" fontWeight="bold" mb={2}>
                            ?? Leyenda de departamentos:
                          </Text>
                          <Wrap spacing={2}>
                            {hrDepartments.map((dept, idx) => (
                              <Box
                                key={dept.id}
                                display="flex"
                                alignItems="center"
                                gap={1}
                              >
                                <Box
                                  width="12px"
                                  height="12px"
                                  borderRadius="full"
                                  bg={`${DEPARTMENT_COLOR_SCHEMES[idx % DEPARTMENT_COLOR_SCHEMES.length]}.500`}
                                />
                                <Text fontSize="xs">{dept.name}</Text>
                              </Box>
                            ))}
                          </Wrap>
                        </Box>
                      )}

                      <FormControl>
                        <FormLabel fontSize="xs" mb={1}>
                          Departamento
                        </FormLabel>
                        <Select
                          size="sm"
                          value={addDrawerDeptFilter}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAddDrawerDeptFilter(
                              value === "all" ? "all" : Number(value),
                            );
                          }}
                        >
                          <option value="all">Todos los departamentos</option>
                          {hrDepartments.map((dept, idx) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl>
                        <FormLabel fontSize="xs" mb={1}>
                          Buscar
                        </FormLabel>
                        <Input
                          size="sm"
                          placeholder="Nombre"
                          value={addDrawerSearch}
                          onChange={(e) => setAddDrawerSearch(e.target.value)}
                        />
                      </FormControl>

                      <VStack align="stretch" spacing={2}>
                        {employeesAvailableToAdd.length === 0 ? (
                          <Text fontSize="xs" color="gray.500">
                            No hay empleados disponibles para agregar.
                          </Text>
                        ) : (
                          employeesAvailableToAdd.map((emp) => {
                            const deptId = emp.primary_department_id ?? -1;
                            const deptIndex = hrDepartments.findIndex(
                              (d) => d.id === deptId,
                            );
                            const colorScheme =
                              DEPARTMENT_COLOR_SCHEMES[
                                deptIndex >= 0 ? deptIndex : 0
                              ];
                            const deptName =
                              departmentMap[deptId] ?? "Sin departamento";

                            return (
                              <Flex
                                key={emp.id}
                                align="center"
                                justify="space-between"
                                px={3}
                                py={2}
                                borderWidth="1px"
                                borderRadius="md"
                                borderColor={`${colorScheme}.200`}
                                bg={`${colorScheme}.50`}
                                _hover={{ bg: `${colorScheme}.100` }}
                              >
                                <Box flex={1}>
                                  <Text
                                    fontSize="sm"
                                    fontWeight="semibold"
                                    color="gray.800"
                                  >
                                    {emp.full_name}
                                  </Text>
                                  <Flex align="center" gap={1} mt={1}>
                                    <Box
                                      width="10px"
                                      height="10px"
                                      borderRadius="full"
                                      bg={`${colorScheme}.500`}
                                    />
                                    <Text
                                      fontSize="xs"
                                      color={`${colorScheme}.700`}
                                      fontWeight="500"
                                    >
                                      {deptName}
                                    </Text>
                                  </Flex>
                                </Box>
                                <Button
                                  size="xs"
                                  colorScheme={colorScheme}
                                  ml={2}
                                  onClick={() => handleAddEmployee(emp.id)}
                                >
                                  Agregar
                                </Button>
                              </Flex>
                            );
                          })
                        )}
                      </VStack>
                    </Stack>
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="ghost" onClick={onCloseAddModal}>
                      Cerrar
                    </Button>
                  </ModalFooter>
                </ModalContent>
              </Modal>

              <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
                <Box p={4} borderRadius="lg" bg="white" borderWidth="1px">
                  <Text fontSize="xs" color={subtleText}>
                    Horas a justificar
                  </Text>

                  <Heading size="lg">
                    {Object.values(projectJustify).reduce(
                      (a, b) => a + (b || 0),

                      0,
                    )}{" "}
                    h
                  </Heading>
                </Box>

                <Box p={4} borderRadius="lg" bg="white" borderWidth="1px">
                  <Text fontSize="xs" color={subtleText}>
                    Justificadas
                  </Text>

                  <Heading size="lg" color="green.600">
                    {Object.values(projectJustified).reduce(
                      (a, b) => a + (b || 0),

                      0,
                    )}{" "}
                    h
                  </Heading>
                </Box>

                <Box p={4} borderRadius="lg" bg="white" borderWidth="1px">
                  <Text fontSize="xs" color={subtleText}>
                    Faltantes
                  </Text>

                  <Heading size="lg" color="orange.600">
                    {Object.keys(projectJustify).reduce(
                      (sum, pid) =>
                        sum +
                        ((projectJustify[Number(pid)] ?? 0) -
                          (projectJustified[Number(pid)] ?? 0)),

                      0,
                    )}{" "}
                    h
                  </Heading>
                </Box>
              </SimpleGrid>
            </Stack>
          </TabPanel>

          {/* Listado detallado por proyecto con boton de edicion */}

          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {projects.map((project) => (
                <Box
                  key={project.id}
                  borderWidth="1px"
                  borderRadius="lg"
                  p={4}
                  bg={cardBg}
                  role="button"
                  tabIndex={0}
                  cursor="pointer"
                  onClick={() => openProjectDetails(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProjectDetails(project);
                    }
                  }}
                  _hover={{ boxShadow: "md" }}
                >
                  <Flex justify="space-between" align="flex-start" mb={2}>
                    <Heading size="sm">{project.name}</Heading>

                    <Badge
                      colorScheme={
                        project.is_active === false ? "red" : "green"
                      }
                    >
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
                        {project.start_date || "Sin inicio"} OCo{" "}
                        {project.end_date || "Sin fin"}
                      </Text>
                    </HStack>

                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Actividades</Badge>

                      <Text>
                        {
                          activities.filter((a) => a.project_id === project.id)
                            .length
                        }
                      </Text>
                    </HStack>

                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Hitos</Badge>

                      <Text>
                        {
                          milestones.filter((m) => m.project_id === project.id)
                            .length
                        }
                      </Text>
                    </HStack>

                    <HStack spacing={2}>
                      <Badge colorScheme="gray">Tareas</Badge>

                      <Text>
                        {
                          rawTasks.filter((t) => t.project_id === project.id)
                            .length
                        }
                      </Text>
                    </HStack>
                  </Stack>
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
                  spacing={4}
                  ml="auto"
                  fontSize="sm"
                  color={subtleText}
                  flexWrap="wrap"
                >
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

              <ProfessionalGantt
                tasks={ganttTasks}
                viewMode="month"
                centerOnToday
                onProjectClick={(id) => setSelectedProjectId(String(id))}
                showMilestoneLines={selectedProjectId !== "all"}
              />
            </Stack>
          </TabPanel>

          <TabPanel px={0}>
            <Stack spacing={6}>
              <Heading size="md">Presupuestos</Heading>

              <Flex
                justify="space-between"
                align="flex-end"
                wrap="wrap"
                gap={4}
              >
                <FormControl minW="220px" maxW="320px">
                  <FormLabel>Proyecto</FormLabel>
                  <Select
                    size="sm"
                    value={budgetProjectFilter}
                    onChange={(e) => setBudgetProjectFilter(e.target.value)}
                  >
                    <option value="">Selecciona un proyecto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={String(project.id)}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <HStack spacing={2}>
                  <Button
                    size="sm"
                    colorScheme="green"
                    onClick={() => {
                      if (!selectedBudgetProjectId) return;
                      createBudgetMilestoneMutation.mutate({
                        projectId: selectedBudgetProjectId,
                        payload: {
                          name: `Hito ${budgetMilestones.length + 1}`,
                          order_index: budgetMilestones.length + 1,
                        },
                      });
                    }}
                    isDisabled={!selectedBudgetProjectId}
                  >
                    + Hito
                  </Button>
                  <Button
                    size="sm"
                    colorScheme={budgetsEditMode ? "orange" : "blue"}
                    onClick={() => setBudgetsEditMode((prev) => !prev)}
                    isDisabled={!selectedBudgetProjectId || !canEditBudgets}
                  >
                    {budgetsEditMode ? "Cerrar edicion" : "Editar tabla"}
                  </Button>
                  {budgetsEditMode && (
                    <Button
                      size="sm"
                      colorScheme="green"
                      onClick={handleBudgetSaveAll}
                      isDisabled={!hasBudgetDrafts || savingBudgets}
                      isLoading={savingBudgets}
                    >
                      Guardar tabla
                    </Button>
                  )}
                  {!hasRealBudgets && (
                    <Button
                      size="sm"
                      colorScheme="purple"
                      onClick={seedTemplateBudgetLines}
                      isDisabled={!selectedBudgetProjectId || seedingTemplate}
                      isLoading={seedingTemplate}
                    >
                      Crear plantilla en proyecto
                    </Button>
                  )}
                </HStack>
              </Flex>

              {!selectedBudgetProjectId ? (
                <Text fontSize="sm" color={subtleText}>
                  Selecciona un proyecto para ver sus presupuestos.
                </Text>
              ) : budgetsQuery.isFetching ? (
                <Text fontSize="sm" color={subtleText}>
                  Cargando presupuestos...
                </Text>
              ) : budgetsQuery.isError ? (
                <Text fontSize="sm" color="red.500">
                  No se pudieron cargar los presupuestos.
                </Text>
              ) : (
                <Box borderWidth="1px" borderRadius="xl" overflow="hidden">
                  <Box overflowX="auto">
                    <Table size="sm" variant="simple" minW="960px">
                      <Thead>
                        <Tr bg="#0a3d2a">
                          <Th
                            rowSpan={2}
                            className="text-sm"
                            color="white"
                            fontWeight="bold"
                          >
                            CONCEPTO
                          </Th>
                          <Th
                            colSpan={2}
                            className="text-sm"
                            textAlign="center"
                            color="white"
                            fontWeight="bold"
                          >
                            HITO 1
                          </Th>
                          <Th
                            colSpan={2}
                            className="text-sm"
                            textAlign="center"
                            color="white"
                            fontWeight="bold"
                          >
                            HITO 2
                          </Th>
                          <Th
                            rowSpan={2}
                            className="text-sm"
                            color="white"
                            fontWeight="bold"
                          >
                            PRES. APROBADO
                          </Th>
                          <Th
                            rowSpan={2}
                            className="text-sm"
                            color="white"
                            fontWeight="bold"
                          >
                            % GASTO
                          </Th>
                          <Th
                            rowSpan={2}
                            className="text-sm"
                            color="white"
                            fontWeight="bold"
                          >
                            GASTO PREVISTO
                          </Th>
                          <Th
                            rowSpan={2}
                            className="text-sm"
                            color="white"
                            fontWeight="bold"
                          >
                            ACCIONES
                          </Th>
                        </Tr>
                        <Tr bg="#0f5d3f">
                          <Th
                            className="text-sm"
                            color="white"
                            fontWeight="semibold"
                          >
                            APROBADO
                          </Th>
                          <Th
                            className="text-sm"
                            color="white"
                            fontWeight="semibold"
                          >
                            JUSTIFICADO
                          </Th>
                          <Th
                            className="text-sm"
                            color="white"
                            fontWeight="semibold"
                          >
                            APROBADO
                          </Th>
                          <Th
                            className="text-sm"
                            color="white"
                            fontWeight="semibold"
                          >
                            JUSTIFICADO
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {displayBudgetRows.length === 0 ? (
                          <Tr>
                            <Td
                              colSpan={budgetMilestones.length * 2 + 4 || 9}
                              textAlign="center"
                              py={10}
                              color="gray.500"
                            >
                              Aun no hay presupuestos guardados para este
                              proyecto.
                            </Td>
                          </Tr>
                        ) : (
                          groupedBudgetRows.map((budget) => {
                            const h1 = Number(budget.hito1_budget ?? 0);
                            const h2 = Number(budget.hito2_budget ?? 0);
                            const approved = h1 + h2;
                            const forecast = Number(
                              budget.forecasted_spent ?? 0,
                            );
                            const percentSpent =
                              approved > 0 ? (forecast / approved) * 100 : 0;
                            const baseKey = (budget.concept || "")
                              .trim()
                              .toLowerCase();
                            const rowBg =
                              CATEGORY_COLOR_MAP[baseKey] ?? undefined;
                            return (
                              <Tr
                                key={budget.id}
                                className="even:bg-gray-50"
                                bg={rowBg}
                              >
                                <Td>
                                  <Editable
                                    submitOnBlur
                                    selectAllOnFocus
                                    key={`concept-${budget.id}-${(budgetDrafts[budget.id]?.concept as string) ?? budget.concept}`}
                                    defaultValue={
                                      (budgetDrafts[budget.id]
                                        ?.concept as string) ?? budget.concept
                                    }
                                    isDisabled={!budgetsEditMode}
                                    onSubmit={(value) =>
                                      handleBudgetCellSave(
                                        budget.id,
                                        "concept",
                                        value,
                                      )
                                    }
                                  >
                                    <EditablePreview fontWeight="semibold" />
                                    <EditableInput />
                                  </Editable>
                                </Td>
                                <Td textAlign="right">
                                  <BudgetNumberCell
                                    value={
                                      budgetDrafts[budget.id]?.hito1_budget ??
                                      budget.hito1_budget ??
                                      0
                                    }
                                    isEditing={
                                      hasRealBudgets && budgetsEditMode
                                    }
                                    onSubmit={(value) =>
                                      handleBudgetCellSave(
                                        budget.id,
                                        "hito1_budget",
                                        value,
                                      )
                                    }
                                  />
                                </Td>
                                <Td textAlign="right">
                                  <BudgetNumberCell
                                    value={
                                      budgetDrafts[budget.id]
                                        ?.justified_hito1 ??
                                      budget.justified_hito1 ??
                                      0
                                    }
                                    isEditing={
                                      hasRealBudgets && budgetsEditMode
                                    }
                                    onSubmit={(value) =>
                                      handleBudgetCellSave(
                                        budget.id,
                                        "justified_hito1",
                                        value,
                                      )
                                    }
                                  />
                                </Td>
                                <Td textAlign="right">
                                  <BudgetNumberCell
                                    value={
                                      budgetDrafts[budget.id]?.hito2_budget ??
                                      budget.hito2_budget ??
                                      0
                                    }
                                    isEditing={
                                      hasRealBudgets && budgetsEditMode
                                    }
                                    onSubmit={(value) =>
                                      handleBudgetCellSave(
                                        budget.id,
                                        "hito2_budget",
                                        value,
                                      )
                                    }
                                  />
                                </Td>
                                <Td textAlign="right">
                                  <BudgetNumberCell
                                    value={
                                      budgetDrafts[budget.id]
                                        ?.justified_hito2 ??
                                      budget.justified_hito2 ??
                                      0
                                    }
                                    isEditing={
                                      hasRealBudgets && budgetsEditMode
                                    }
                                    onSubmit={(value) =>
                                      handleBudgetCellSave(
                                        budget.id,
                                        "justified_hito2",
                                        value,
                                      )
                                    }
                                  />
                                </Td>
                                <Td textAlign="right">
                                <BudgetNumberCell
                                  value={budgetDrafts[budget.id]?.approved_budget ?? approved}
                                  isEditing={budgetsEditMode}
                                  onSubmit={(value) =>
                                    handleBudgetCellSave(
                                      budget.id,
                                      "approved_budget",
                                      value,
                                    )
                                  }
                                />
                                </Td>
                                <Td textAlign="right">
                                  <Text fontFamily="mono">
                                    {formatPercent(percentSpent)}
                                  </Text>
                                </Td>
                                <Td textAlign="right">
                                  <BudgetNumberCell
                                    value={
                                      budgetDrafts[budget.id]
                                        ?.forecasted_spent ??
                                      budget.forecasted_spent ??
                                      0
                                    }
                                    isEditing={
                                      hasRealBudgets && budgetsEditMode
                                    }
                                    onSubmit={(value) =>
                                      handleBudgetCellSave(
                                        budget.id,
                                        "forecasted_spent",
                                        value,
                                      )
                                    }
                                  />
                                </Td>
                                <Td>
                                  {hasRealBudgets ? (
                                    <Flex gap={2} flexWrap="wrap">
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        isDisabled={!budgetsEditMode}
                                        onClick={() =>
                                          openBudgetModal("edit", budget)
                                        }
                                      >
                                        Editar
                                      </Button>
                                    </Flex>
                                  ) : (
                                    <Text fontSize="xs" color="gray.500">
                                      Anade presupuestos para editarlos aqui.
                                    </Text>
                                  )}
                                </Td>
                              </Tr>
                            );
                          })
                        )}
                      </Tbody>
                      <Tfoot>
                        <Tr bg="rgba(196,116,255,0.15)" fontWeight="semibold">
                          <Td>Total</Td>
                          <Td textAlign="right">
                            <EuroCell value={budgetsTabTotals.hito1} />
                          </Td>
                          <Td textAlign="right">
                            <EuroCell
                              value={budgetsTabTotals.justificados?.[0] ?? 0}
                            />
                          </Td>
                          <Td textAlign="right">
                            <EuroCell value={budgetsTabTotals.hito2} />
                          </Td>
                          <Td textAlign="right">
                            <EuroCell
                              value={budgetsTabTotals.justificados?.[1] ?? 0}
                            />
                          </Td>
                          <Td textAlign="right">
                            <EuroCell value={budgetsTabTotals.approved} />
                          </Td>
                          <Td />
                          <Td textAlign="right">
                            <EuroCell value={budgetsTabTotals.gasto} />
                          </Td>
                          <Td />
                        </Tr>
                        <Tr bg="rgba(196,116,255,0.2)" fontWeight="semibold">
                          <Td>Diferencia (por justificar)</Td>
                          <Td textAlign="right">
                            <EuroCell value={budgetsDiffH1} />
                          </Td>
                          <Td />
                          <Td textAlign="right">
                            <EuroCell value={budgetsDiffH2} />
                          </Td>
                          <Td />
                          <Td textAlign="right">
                            <EuroCell value={budgetsDiffH1 + budgetsDiffH2} />
                          </Td>
                          <Td />
                          <Td textAlign="right">
                            <EuroCell value={budgetsTabTotals.gasto} />
                          </Td>
                          <Td />
                        </Tr>
                      </Tfoot>
                    </Table>
                  </Box>
                </Box>
              )}
            </Stack>
          </TabPanel>

          {/* Alta de proyecto con actividades, subactividades e hitos locales */}

          <TabPanel px={0}>
            <Stack spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Nombre del proyecto</FormLabel>

                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Descripcion</FormLabel>

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

                  <Input
                    type="date"
                    value={projectEnd}
                    onChange={(e) => setProjectEnd(e.target.value)}
                  />
                </FormControl>
              </SimpleGrid>

              <Flex justify="space-between" align="center">
                <Heading size="sm">Actividades</Heading>

                <Button size="sm" onClick={handleAddActivity}>
                  + Anadir actividad
                </Button>
              </Flex>

              <Stack spacing={3}>
                {projectActivities.length === 0 && (
                  <Text fontSize="sm" color={subtleText}>
                    Anade actividades con peso y fechas.
                  </Text>
                )}

                {projectActivities.map((act, idx) => (
                  <Box
                    key={act.id}
                    borderWidth="1px"
                    borderRadius="md"
                    p={3}
                    bg={cardBg}
                  >
                    <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3}>
                      <FormControl>
                        <FormLabel fontSize="sm">
                          Actividad #{idx + 1}
                        </FormLabel>

                        <Input
                          value={act.name}
                          onChange={(e) =>
                            setProjectActivities((prev) =>
                              prev.map((item) =>
                                item.id === act.id
                                  ? { ...item, name: e.target.value }
                                  : item,
                              ),
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
                                  : item,
                              ),
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
                                item.id === act.id
                                  ? { ...item, start: e.target.value }
                                  : item,
                              ),
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
                                item.id === act.id
                                  ? { ...item, end: e.target.value }
                                  : item,
                              ),
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
                          setProjectActivities((prev) =>
                            prev.filter((item) => item.id !== act.id),
                          )
                        }
                      >
                        Eliminar
                      </Button>
                    </SimpleGrid>

                    <Button
                      size="xs"
                      mt={2}
                      onClick={() => handleAddSubactivity(act.id)}
                    >
                      + Anadir subactividad
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
                              <FormLabel fontSize="xs">
                                Subactividad #{sidx + 1}
                              </FormLabel>

                              <Input
                                value={sub.name}
                                onChange={(e) =>
                                  setProjectActivities((prev) =>
                                    prev.map((item) =>
                                      item.id === act.id
                                        ? {
                                            ...item,

                                            subactivities:
                                              item.subactivities.map((s) =>
                                                s.id === sub.id
                                                  ? {
                                                      ...s,

                                                      name: e.target.value,
                                                    }
                                                  : s,
                                              ),
                                          }
                                        : item,
                                    ),
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

                                            subactivities:
                                              item.subactivities.map((s) =>
                                                s.id === sub.id
                                                  ? {
                                                      ...s,

                                                      weight: Number(
                                                        e.target.value,
                                                      ),
                                                    }
                                                  : s,
                                              ),
                                          }
                                        : item,
                                    ),
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

                                            subactivities:
                                              item.subactivities.map((s) =>
                                                s.id === sub.id
                                                  ? {
                                                      ...s,

                                                      start: e.target.value,
                                                    }
                                                  : s,
                                              ),
                                          }
                                        : item,
                                    ),
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

                                            subactivities:
                                              item.subactivities.map((s) =>
                                                s.id === sub.id
                                                  ? {
                                                      ...s,

                                                      end: e.target.value,
                                                    }
                                                  : s,
                                              ),
                                          }
                                        : item,
                                    ),
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

              {/* Hitos */}
              <Flex justify="space-between" align="center">
                <Heading size="sm">Hitos</Heading>

                <Button size="sm" onClick={handleAddMilestone}>
                  + Anadir hito
                </Button>
              </Flex>

              <Stack spacing={3}>
                {projectMilestones.length === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    Anade hitos con fechas.
                  </Text>
                ) : (
                  projectMilestones.map((mil, idx) => (
                    <SimpleGrid
                      key={mil.id}
                      columns={{ base: 1, md: 4 }}
                      spacing={3}
                    >
                      <FormControl>
                        <FormLabel fontSize="sm">Hito #{idx + 1}</FormLabel>

                        <Input
                          value={mil.name}
                          onChange={(e) =>
                            setProjectMilestones((prev) =>
                              prev.map((m) =>
                                m.id === mil.id
                                  ? { ...m, name: e.target.value }
                                  : m,
                              ),
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
                              prev.map((m) =>
                                m.id === mil.id
                                  ? { ...m, start: e.target.value }
                                  : m,
                              ),
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
                              prev.map((m) =>
                                m.id === mil.id
                                  ? { ...m, end: e.target.value }
                                  : m,
                              ),
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
                          setProjectMilestones((prev) =>
                            prev.filter((m) => m.id !== mil.id),
                          )
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

      <BudgetModal
        isOpen={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        onSave={handleBudgetSave}
        initialValues={budgetModalInitial}
        title={
          budgetModalMode === "edit"
            ? "Editar presupuesto"
            : "Agregar presupuesto"
        }
        submitLabel={budgetModalMode === "edit" ? "Actualizar" : "Guardar"}
        isSaving={
          budgetModalMode === "edit"
            ? updateBudgetMutation.isPending
            : createBudgetMutation.isPending
        }
      />

      {/* Popup centrado de detalle/edicion del proyecto seleccionado */}

      <Modal
        isOpen={detailsOpen}
        onClose={closeProjectDetails}
        size="6xl"
        scrollBehavior="inside"
        isCentered
      >
        <ModalOverlay />

        <ModalContent>
          <ModalHeader borderBottomWidth="1px">
            {selectedProject ? `Proyecto: ${selectedProject.name}` : "Proyecto"}
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            {selectedProject ? (
              <Stack spacing={4}>
                <Stack spacing={1} fontSize="sm" color={subtleText}>
                  <Text>ID: {selectedProject.id}</Text>

                  {selectedProject.created_at && (
                    <Text>Creado: {selectedProject.created_at}</Text>
                  )}
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

                    <Text fontWeight="semibold">
                      {selectedProject.end_date || "Sin fin"}
                    </Text>
                  </Box>

                  <Box borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontSize="xs" color={subtleText}>
                      Actividades
                    </Text>

                    <Text fontWeight="semibold">
                      {selectedProjectActivities.length}
                    </Text>
                  </Box>

                  <Box borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontSize="xs" color={subtleText}>
                      Hitos
                    </Text>

                    <Text fontWeight="semibold">
                      {selectedProjectMilestones.length}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Divider />

                <Heading size="sm">Editar datos</Heading>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <FormControl isRequired>
                    <FormLabel>Nombre</FormLabel>

                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
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
                        <Box
                          key={act.id}
                          borderWidth="1px"
                          borderRadius="md"
                          p={3}
                        >
                          <SimpleGrid
                            columns={{ base: 1, md: 2 }}
                            spacing={2}
                            mb={2}
                          >
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

                                    [act.id]: {
                                      ...form,

                                      description: e.target.value,
                                    },
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

                                    [act.id]: {
                                      ...form,

                                      start: e.target.value,
                                    },
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
                              {
                                selectedProjectSubactivities.filter(
                                  (sub) => sub.activity_id === act.id,
                                ).length
                              }
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
                        (act) => act.id === sub.activity_id,
                      );

                      return (
                        <Box
                          key={sub.id}
                          borderWidth="1px"
                          borderRadius="md"
                          p={3}
                        >
                          <Text fontSize="xs" color={subtleText} mb={1}>
                            Actividad: {parentActivity?.name ?? "-"}
                          </Text>

                          <SimpleGrid
                            columns={{ base: 1, md: 2 }}
                            spacing={2}
                            mb={2}
                          >
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

                                    [sub.id]: {
                                      ...form,

                                      description: e.target.value,
                                    },
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

                                    [sub.id]: {
                                      ...form,

                                      start: e.target.value,
                                    },
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
                        <Box
                          key={milestone.id}
                          borderWidth="1px"
                          borderRadius="md"
                          p={3}
                        >
                          <SimpleGrid
                            columns={{ base: 1, md: 2 }}
                            spacing={2}
                            mb={2}
                          >
                            <FormControl>
                              <FormLabel fontSize="xs">Titulo</FormLabel>

                              <Input
                                value={form.title}
                                onChange={(e) =>
                                  setMilestoneEdits((prev) => ({
                                    ...prev,

                                    [milestone.id]: {
                                      ...form,

                                      title: e.target.value,
                                    },
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

                                    [milestone.id]: {
                                      ...form,

                                      description: e.target.value,
                                    },
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

                                    [milestone.id]: {
                                      ...form,

                                      due: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </FormControl>
                          </SimpleGrid>

                          <Flex justify="flex-end">
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() =>
                                handleUpdateMilestone(milestone.id)
                              }
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
                      <Box
                        key={task.id}
                        borderWidth="1px"
                        borderRadius="md"
                        p={3}
                      >
                        <Flex justify="space-between" align="center" mb={1}>
                          <Text fontWeight="semibold">{task.title}</Text>

                          <Badge
                            colorScheme={task.is_completed ? "green" : "yellow"}
                          >
                            {task.status ||
                              (task.is_completed ? "completed" : "pendiente")}
                          </Badge>
                        </Flex>

                        <Text fontSize="xs" color={subtleText}>
                          {task.start_date || "Sin inicio"} OCo{" "}
                          {task.end_date || "Sin fin"}
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
          </ModalBody>

          <ModalFooter borderTopWidth="1px">
            <Button variant="ghost" mr={3} onClick={closeProjectDetails}>
              Cerrar
            </Button>

            <Button
              variant="outline"
              colorScheme="red"
              mr={3}
              onClick={handleDeleteProject}
              isLoading={deleteProjectMutation.isPending}
              isDisabled={!selectedProject}
            >
              Eliminar proyecto
            </Button>

            <Button
              colorScheme="green"
              onClick={handleUpdateProject}
              isLoading={updateProjectMutation.isPending}
              isDisabled={!selectedProject}
            >
              Guardar cambios
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppShell>
  );
};

export default ErpProjectsPage;


