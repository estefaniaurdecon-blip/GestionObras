import React, { useEffect, useMemo, useState } from "react";
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
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { fetchTenantTools, launchTool, Tool } from "../api/tools";
import { fetchDashboardSummary, type DashboardSummary } from "../api/dashboard";
import { fetchProjectBudgets, type ProjectBudgetLine } from "../api/erpBudgets";
import { fetchEmployees, type EmployeeProfile } from "../api/hr";
import {
  fetchErpProjects,
  fetchTimeReport,
  type ErpProject,
  type TimeReportRow,
} from "../api/erpReports";
import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";
import { ToolGrid } from "../components/tools/ToolGrid";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { HRPanel, type Employee as HREmployee } from "../hr-panel";
import {
  buildParentChildMap,
  EXTERNAL_COLLAB_LABEL,
  getDefaultBudgetTemplate,
  groupBudgetsByConcept,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  normalizeConceptKey,
  parseExternalCollaborationDetails,
  formatEuroValue,
} from "../utils/erp";

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const addDays = (value: Date, days: number) => {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const AVAIL_COLORS = [
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#ec4899",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
  "#a855f7",
];

export const DashboardPage: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const statAccent = useColorModeValue("brand.500", "brand.300");
  const balanceChartBg = useColorModeValue("gray.200", "gray.950");
  const balanceTableBg = useColorModeValue("gray.100", "gray.900");
  const balanceTableRowOddBg = useColorModeValue("white", "gray.800");
  const balanceTableRowHoverBg = useColorModeValue("green.50", "whiteAlpha.100");
  const balanceTableBorderColor = useColorModeValue("gray.200", "gray.700");
  const balanceTableHeadBg = useColorModeValue("gray.200", "gray.800");
  const balanceTableHeadText = useColorModeValue("gray.600", "gray.300");
  const balanceTableYearText = useColorModeValue("gray.700", "gray.200");
  const balanceTableTotalText = useColorModeValue("gray.800", "gray.100");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id ?? undefined;
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const canCreateTimeReports =
    isSuperAdmin ||
    (currentUser?.permissions?.includes("can_create_time_reports") ?? false);
  const roleName = currentUser?.role_name ?? null;
  const hasHrPermission =
    currentUser?.permissions?.includes("hr:read") ?? false;
  const canReadHr =
    isSuperAdmin ||
    hasHrPermission ||
    roleName === "tenant_admin" ||
    roleName === "hr_manager";
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId;

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedBalanceProjectIds, setSelectedBalanceProjectIds] = useState<number[]>([]);
  const [balanceHover, setBalanceHover] = useState<{
    projectId: number;
    year: number;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState(() =>
    formatDate(addDays(new Date(), -6)),
  );
  const [dateTo, setDateTo] = useState(() => formatDate(new Date()));
  const [userFilter, setUserFilter] = useState("");

  const { data: projects, isLoading: isLoadingProjects } = useQuery<
    ErpProject[]
  >({
    queryKey: ["dashboard-erp-projects", effectiveTenantId],
    queryFn: () => fetchErpProjects(effectiveTenantId),
  });

  useEffect(() => {
    if (selectedBalanceProjectIds.length > 0) return;
    if (projects && projects.length > 0) {
      setSelectedBalanceProjectIds(projects.slice(0, 3).map((p) => p.id));
    }
  }, [projects, selectedBalanceProjectIds.length]);

  const budgetLinesQuery = useQuery<
    Array<{ projectId: number; lines: ProjectBudgetLine[] }>
  >({
    queryKey: [
      "dashboard-project-budgets",
      selectedBalanceProjectIds,
      effectiveTenantId ?? "all",
    ],
    queryFn: async () => {
      if (selectedBalanceProjectIds.length === 0) return [];
      const results = await Promise.all(
        selectedBalanceProjectIds.map(async (projectId) => ({
          projectId,
          lines: await fetchProjectBudgets(projectId, effectiveTenantId),
        })),
      );
      return results;
    },
    enabled: selectedBalanceProjectIds.length > 0,
  });

  const reportQuery = useQuery<TimeReportRow[]>({
    queryKey: ["dashboard-time-report", selectedProjectId, dateFrom, dateTo],
    queryFn: () =>
      fetchTimeReport({
        projectId: selectedProjectId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      }),
  });

  useEffect(() => {
    if (!reportQuery.error) return;
    const error = reportQuery.error as any;
    const message =
      error?.response?.data?.detail ??
      t("dashboard.messages.reportLoadFallback");
    toast({
      title: t("dashboard.messages.reportLoadTitle"),
      description: message,
      status: "error",
    });
  }, [reportQuery.error, t, toast]);

  const reportRows: TimeReportRow[] = reportQuery.data ?? [];
  const filteredReportRows = useMemo<TimeReportRow[]>(() => {
    const normalized = userFilter.trim().toLowerCase();
    if (!normalized) return reportRows;
    return reportRows.filter((row: TimeReportRow) =>
      `${row.username ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [reportRows, userFilter]);

  const reportHours = useMemo(
    () =>
      filteredReportRows.reduce(
        (acc: number, row: TimeReportRow) =>
          acc + Number(row.total_hours || 0),
        0,
      ),
    [filteredReportRows],
  );

  const { data: tools, isLoading } = useQuery<Tool[]>({
    queryKey: ["tenant-tools", tenantId],
    queryFn: () => fetchTenantTools(tenantId as number),
    enabled: Boolean(tenantId),
  });

  const hrEmployeesQuery = useQuery<EmployeeProfile[]>({
    queryKey: ["dashboard-hr-employees", effectiveTenantId ?? "all"],
    queryFn: () => fetchEmployees(effectiveTenantId ?? null),
    enabled: canReadHr && (isSuperAdmin || Boolean(tenantId)),
  });

  const hrPanelEmployees = useMemo<HREmployee[]>(() => {
    const list = hrEmployeesQuery.data ?? [];
    return list.map((employee) => {
      const name =
        employee.full_name?.trim() ||
        employee.email?.trim() ||
        `Empleado ${employee.id}`;
      const titulacion = (
        employee.titulacion === "doctorado" ||
        employee.titulacion === "universitario" ||
        employee.titulacion === "no_universitario"
          ? employee.titulacion
          : "no_universitario"
      ) as HREmployee["titulacion"];
      return {
        id: employee.id,
        name,
        titulacion,
        available_hours: Number(employee.available_hours ?? 0),
        is_active: employee.is_active,
      };
    });
  }, [hrEmployeesQuery.data]);

  const defaultBudgetTemplate = useMemo(() => getDefaultBudgetTemplate(), []);
  const baseParentMap = useMemo(
    () => buildParentChildMap(defaultBudgetTemplate),
    [defaultBudgetTemplate],
  );

  const projectColorMap = useMemo(() => {
    const map = new Map<number, string>();
    (projects ?? []).forEach((project, idx) => {
      map.set(project.id, AVAIL_COLORS[idx % AVAIL_COLORS.length]);
    });
    return map;
  }, [projects]);

  const budgetLinesByProject = useMemo(() => {
    const map = new Map<number, ProjectBudgetLine[]>();
    (budgetLinesQuery.data ?? []).forEach((item) => {
      map.set(item.projectId, item.lines);
    });
    return map;
  }, [budgetLinesQuery.data]);

  const resolveActiveMonthsInYear = (
    start: Date,
    end: Date,
    year: number,
  ) => {
    const yearStartDate = new Date(year, 0, 1);
    const yearEndDate = new Date(year, 11, 31, 23, 59, 59, 999);
    const effectiveStart = start > yearStartDate ? start : yearStartDate;
    const effectiveEnd = end < yearEndDate ? end : yearEndDate;
    if (effectiveEnd < effectiveStart) return 0;
    return (
      (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 +
      (effectiveEnd.getMonth() - effectiveStart.getMonth()) +
      1
    );
  };

  const balanceSeries = useMemo(() => {
    if (!projects || selectedBalanceProjectIds.length === 0) return [];
    return selectedBalanceProjectIds
      .map((projectId) => {
        const project = projects.find((p) => p.id === projectId);
        if (!project || !project.start_date || !project.end_date) return null;
        const start = new Date(project.start_date);
        const end = new Date(project.end_date);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        if (end < start) return null;
        const yearStart = start.getFullYear();
        const yearEnd = end.getFullYear();
        const durationDays =
          Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
        const durationMonths = Math.max(1, Math.ceil(durationDays / 30));
        const subsidyPercent = Number(project.subsidy_percent ?? 0);

        const budgetRows = budgetLinesByProject.get(projectId) ?? [];
        const mapCopy: Record<string, string[]> = {};
        Object.entries(baseParentMap).forEach(([key, value]) => {
          mapCopy[key] = [...value];
        });
        const externalParentKey = normalizeConceptKey(EXTERNAL_COLLAB_LABEL);
        const externalChildren = mapCopy[externalParentKey] ?? [];
        budgetRows
          .filter((row) => isExternalCollaborationConcept(row.concept))
          .forEach((row) => {
            const details = parseExternalCollaborationDetails(row.concept);
            if (!details) return;
            const childKey = normalizeConceptKey(row.concept);
            if (!externalChildren.includes(childKey)) {
              externalChildren.push(childKey);
            }
          });
        mapCopy[externalParentKey] = externalChildren;
        const groupedRows = groupBudgetsByConcept(budgetRows);
        const parentKeys = new Set(Object.keys(mapCopy));
        let approved = 0;
        let forecasted = 0;
        groupedRows.forEach((row) => {
          const key = normalizeConceptKey(row.concept);
          const isParentRow = isAllCapsConcept(row.concept) && parentKeys.has(key);
          const isGeneralExpenses = isGeneralExpensesConcept(row.concept);
          if (!isParentRow && !isGeneralExpenses) return;
          const approvedValue =
            row.approved_budget ??
            Number(row.hito1_budget ?? 0) + Number(row.hito2_budget ?? 0);
          approved += Number(approvedValue || 0);
          forecasted += Number(row.forecasted_spent ?? 0);
        });
        const baseResult = (approved * subsidyPercent) / 100 - forecasted;

        const points = [];
        for (let year = yearStart; year <= yearEnd; year += 1) {
          const monthsActive = resolveActiveMonthsInYear(start, end, year);
          const annualized =
            durationMonths > 0 ? (baseResult / durationMonths) * monthsActive : 0;
          points.push({ year, value: annualized, monthsActive });
        }
        return {
          project,
          color: projectColorMap.get(projectId) ?? AVAIL_COLORS[0],
          points,
        };
      })
      .filter(Boolean) as Array<{
      project: ErpProject;
      color: string;
      points: Array<{ year: number; value: number; monthsActive: number }>;
    }>;
  }, [
    projects,
    selectedBalanceProjectIds,
    budgetLinesByProject,
    baseParentMap,
    projectColorMap,
  ]);

  const balanceYears = useMemo(() => {
    const years = new Set<number>();
    balanceSeries.forEach((series) => {
      series.points.forEach((point) => years.add(point.year));
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [balanceSeries]);

  const balanceTotalsByYear = useMemo(() => {
    const totals: Record<number, number> = {};
    balanceYears.forEach((year) => {
      totals[year] = balanceSeries.reduce((acc, series) => {
        const point = series.points.find((p) => p.year === year);
        return acc + (point?.value ?? 0);
      }, 0);
    });
    return totals;
  }, [balanceSeries, balanceYears]);

  const balanceMax = useMemo(() => {
    if (balanceSeries.length === 0) return 0;
    const values = balanceSeries.flatMap((series) =>
      series.points.map((point) => Math.abs(point.value)),
    );
    return values.length > 0 ? Math.max(...values) : 0;
  }, [balanceSeries]);

  const formatCompact = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return formatEuroValue(value);
  };

  const formatFull = (value: number) => `${formatEuroValue(value)} EUR`;

  const balanceKpis = useMemo(() => {
    if (balanceYears.length === 0) {
      return {
        lastYear: null,
        lastValue: 0,
        growth: 0,
        total: 0,
        best: null as null | { name: string; total: number; color: string },
      };
    }
    const lastYear = balanceYears[balanceYears.length - 1];
    const prevYear =
      balanceYears.length > 1 ? balanceYears[balanceYears.length - 2] : null;
    const lastValue = balanceTotalsByYear[lastYear] ?? 0;
    const prevValue = prevYear != null ? balanceTotalsByYear[prevYear] ?? 0 : 0;
    const growth =
      prevYear != null && prevValue !== 0
        ? ((lastValue - prevValue) / Math.abs(prevValue)) * 100
        : 0;
    const total = Object.values(balanceTotalsByYear).reduce(
      (acc, val) => acc + val,
      0,
    );
    let best: { name: string; total: number; color: string } | null = null;
    balanceSeries.forEach((series) => {
      const seriesTotal = series.points.reduce((acc, p) => acc + p.value, 0);
      if (!best || seriesTotal > best.total) {
        best = {
          name: series.project.name,
          total: seriesTotal,
          color: series.color,
        };
      }
    });
    return { lastYear, lastValue, growth, total, best };
  }, [balanceTotalsByYear, balanceYears, balanceSeries]);

  const handleLaunch = async (tool: Tool) => {
    try {
      if (tool.slug === "erp") {
        setLaunchUrl(null);
        setSelectedTool(null);
        navigate({ to: "/erp/projects" });
        return;
      }

      setSelectedTool(tool);
      if (!tenantId) {
        toast({
          title: t("dashboard.messages.toolLaunchTitle"),
          description: t("dashboard.messages.toolLaunchFallback"),
          status: "error",
        });
        return;
      }
      const result = await launchTool(tool.id, tenantId);

      if (tool.slug === "moodle") {
        window.open(result.launch_url, "_blank", "noopener,noreferrer");
        return;
      }

      setLaunchUrl(result.launch_url);
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ??
        t("dashboard.messages.toolLaunchFallback");
      toast({
        title: t("dashboard.messages.toolLaunchTitle"),
        description: message,
        status: "error",
      });
    }
  };

  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("dashboard.header.eyebrow")}
          title={t("dashboard.header.title")}
          subtitle={t("dashboard.header.subtitle")}
        />
      </Box>

      {canReadHr && (
        <Box mb={8}>
          <HRPanel employees={hrPanelEmployees} loading={hrEmployeesQuery.isLoading} />
        </Box>
      )}

      <Box
        borderWidth="1px"
        borderRadius="xl"
        bg={cardBg}
        p={{ base: 4, md: 6 }}
        mb={8}
      >
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={4} mb={4}>
          <Box>
            <Heading as="h2" size="md">
              {t("dashboard.balanceHistory.title")}
            </Heading>
            <Text fontSize="sm" color="#64748b">
              {t("dashboard.balanceHistory.subtitle")}
            </Text>
          </Box>
          <Box
            display="flex"
            alignItems="center"
            gap={2}
            bg={panelBg}
            borderRadius="8px"
            px={3}
            py={2}
            border="1px solid"
            borderColor={tableHeadBg}
          >
            <Text fontSize="xs" color={subtleText} fontFamily="'Courier New',monospace">
              {t("dashboard.balanceHistory.activeLabel")}
            </Text>
            <Text fontSize="sm" fontWeight="bold" fontFamily="'Courier New',monospace">
              {selectedBalanceProjectIds.length}
            </Text>
            <Text fontSize="xs" color={subtleText} fontFamily="'Courier New',monospace">
              / {projects?.length ?? 0}
            </Text>
          </Box>
        </Flex>

        <Flex wrap="wrap" gap={2} mb={6}>
          {(projects ?? []).map((project) => {
            const active = selectedBalanceProjectIds.includes(project.id);
            const color = projectColorMap.get(project.id) ?? AVAIL_COLORS[0];
            return (
              <Box
                key={project.id}
                as="button"
                onClick={() =>
                  setSelectedBalanceProjectIds((prev) =>
                    prev.includes(project.id)
                      ? prev.length > 1
                        ? prev.filter((id) => id !== project.id)
                        : prev
                      : [...prev, project.id],
                  )
                }
                display="flex"
                alignItems="center"
                gap={2}
                bg={active ? `${color}22` : panelBg}
                borderRadius="10px"
                px={3}
                py={2}
                border={`1.5px solid ${active ? color : tableHeadBg}`}
                _hover={{ borderColor: color }}
              >
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  bg={color}
                  boxShadow={active ? `0 0 6px ${color}88` : "none"}
                />
                <Text
                  fontSize="sm"
                  color={active ? color : subtleText}
                  fontFamily="'Georgia',serif"
                  fontWeight={active ? 600 : 400}
                >
                  {project.name}
                </Text>
              </Box>
            );
          })}
        </Flex>

        {balanceSeries.length === 0 && (
          <Text fontSize="sm" color={subtleText}>
            {t("dashboard.balanceHistory.empty")}
          </Text>
        )}

        {balanceSeries.length > 0 && (
          <>
            <Flex wrap="wrap" gap={3} mb={6}>
              <Box
                flex="1 1 140px"
                bg={panelBg}
                borderRadius="14px"
                px={4}
                py={3}
                border="1px solid"
                borderColor={tableHeadBg}
              >
                <Text
                  fontSize="xs"
                  color={subtleText}
                  textTransform="uppercase"
                  letterSpacing="1.5px"
                  fontFamily="'Courier New',monospace"
                >
                  {t("dashboard.balanceHistory.kpiLastYear", {
                    year: balanceKpis.lastYear ?? "",
                  })}
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="#10b981">
                  {formatCompact(balanceKpis.lastValue)}
                </Text>
                {balanceKpis.lastYear && (
                  <Text fontSize="xs" color={subtleText}>
                    {balanceKpis.lastYear}
                  </Text>
                )}
              </Box>
              <Box
                flex="1 1 140px"
                bg={panelBg}
                borderRadius="14px"
                px={4}
                py={3}
                border="1px solid"
                borderColor={tableHeadBg}
              >
                <Text
                  fontSize="xs"
                  color={subtleText}
                  textTransform="uppercase"
                  letterSpacing="1.5px"
                  fontFamily="'Courier New',monospace"
                >
                  {t("dashboard.balanceHistory.kpiGrowth")}
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="#06b6d4">
                  {balanceKpis.growth.toFixed(1)}%
                </Text>
                <Text fontSize="xs" color={subtleText}>
                  {t("dashboard.balanceHistory.kpiGrowthSub")}
                </Text>
              </Box>
              <Box
                flex="1 1 140px"
                bg={panelBg}
                borderRadius="14px"
                px={4}
                py={3}
                border="1px solid"
                borderColor={tableHeadBg}
              >
                <Text
                  fontSize="xs"
                  color={subtleText}
                  textTransform="uppercase"
                  letterSpacing="1.5px"
                  fontFamily="'Courier New',monospace"
                >
                  {t("dashboard.balanceHistory.kpiTotal")}
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="#8b5cf6">
                  {formatCompact(balanceKpis.total)}
                </Text>
                <Text fontSize="xs" color={subtleText}>
                  {t("dashboard.balanceHistory.kpiTotalSub")}
                </Text>
              </Box>
              <Box
                flex="1 1 140px"
                bg={panelBg}
                borderRadius="14px"
                px={4}
                py={3}
                border="1px solid"
                borderColor={tableHeadBg}
              >
                <Text
                  fontSize="xs"
                  color={subtleText}
                  textTransform="uppercase"
                  letterSpacing="1.5px"
                  fontFamily="'Courier New',monospace"
                >
                  {t("dashboard.balanceHistory.kpiBest")}
                </Text>
                <Text
                  fontSize="lg"
                  fontWeight="bold"
                  color={balanceKpis.best?.color ?? "#94a3b8"}
                >
                  {balanceKpis.best?.name ?? "—"}
                </Text>
                {balanceKpis.best && (
                  <Text fontSize="xs" color={subtleText}>
                    {formatFull(balanceKpis.best.total)}
                  </Text>
                )}
              </Box>
            </Flex>

            <Box
              bg={balanceChartBg}
              border="1px solid"
              borderColor={tableHeadBg}
              borderRadius="20px"
              px={5}
              py={5}
              boxShadow="inset 0 0 0 1px rgba(0,0,0,0.08)"
              mb={6}
            >
              <Flex justify="space-between" align="center" mb={3}>
                <Text
                  fontSize="xs"
                  color={subtleText}
                  textTransform="uppercase"
                  letterSpacing="2px"
                  fontFamily="'Courier New',monospace"
                >
                  {t("dashboard.balanceHistory.chartTitle")}
                </Text>
                <HStack spacing={4} flexWrap="wrap">
                  {balanceSeries.map((series) => (
                    <HStack key={series.project.id} spacing={2}>
                      <Box
                        w="20px"
                        h="2px"
                        bg={series.color}
                        borderRadius="2px"
                        boxShadow={`0 0 4px ${series.color}66`}
                      />
                      <Text fontSize="xs" color="#94a3b8">
                        {series.project.name}
                      </Text>
                    </HStack>
                  ))}
                </HStack>
              </Flex>

              {(() => {
                const W = 980;
                const H = 380;
                const PAD = { top: 30, right: 28, bottom: 44, left: 74 };
                const chartW = W - PAD.left - PAD.right;
                const chartH = H - PAD.top - PAD.bottom;
                const values = balanceSeries.flatMap((series) =>
                  series.points.map((point) => point.value),
                );
                const minVal = Math.min(0, ...values);
                const maxVal = Math.max(0, ...values);
                const range = maxVal - minVal || 1;
                const paddedMin = minVal - range * 0.1;
                const paddedMax = maxVal + range * 0.1;
                const paddedRange = paddedMax - paddedMin || 1;
                const x = (i: number) =>
                  PAD.left + (i / Math.max(1, balanceYears.length - 1)) * chartW;
                const y = (val: number) =>
                  PAD.top + chartH - ((val - paddedMin) / paddedRange) * chartH;
                const gridCount = 5;
                const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
                  const val = paddedMin + (paddedRange / gridCount) * i;
                  return { val, yPos: y(val) };
                });
                const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
                  if (points.length < 2) return "";
                  let path = `M ${points[0].x} ${points[0].y}`;
                  const tension = 0.3;
                  for (let i = 0; i < points.length - 1; i += 1) {
                    const p0 = points[Math.max(i - 1, 0)];
                    const p1 = points[i];
                    const p2 = points[i + 1];
                    const p3 = points[Math.min(i + 2, points.length - 1)];
                    const cp1x = p1.x + (p2.x - p0.x) * tension;
                    const cp1y = p1.y + (p2.y - p0.y) * tension;
                    const cp2x = p2.x - (p3.x - p1.x) * tension;
                    const cp2y = p2.y - (p3.y - p1.y) * tension;
                    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                  }
                  return path;
                };
                return (
                  <Box>
                    <svg
                      viewBox={`0 0 ${W} ${H}`}
                      style={{ width: "100%", maxWidth: W, display: "block", margin: "0 auto" }}
                    >
                      <defs>
                        {balanceSeries.map((series) => (
                          <React.Fragment key={`grad-${series.project.id}`}>
                            <linearGradient
                              id={`balanceGrad-${series.project.id}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop offset="0%" stopColor={series.color} stopOpacity={0.28} />
                              <stop offset="65%" stopColor={series.color} stopOpacity={0.12} />
                              <stop offset="100%" stopColor={series.color} stopOpacity={0.03} />
                            </linearGradient>
                            <linearGradient
                              id={`balanceLine-${series.project.id}`}
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop offset="0%" stopColor={series.color} stopOpacity={0.55} />
                              <stop offset="50%" stopColor={series.color} stopOpacity={1} />
                              <stop offset="100%" stopColor={series.color} stopOpacity={0.55} />
                            </linearGradient>
                          </React.Fragment>
                        ))}
                        <filter id="balanceGlow">
                          <feGaussianBlur stdDeviation="2.2" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                        <filter id="balanceShadow">
                          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.22" />
                        </filter>
                        <pattern id="balanceDots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
                          <circle cx="1.5" cy="1.5" r="0.7" fill="#cbd5e1" opacity="0.4" />
                        </pattern>
                      </defs>

                      <rect
                        x={PAD.left}
                        y={PAD.top}
                        width={chartW}
                        height={chartH}
                        fill="url(#balanceDots)"
                        opacity={0.35}
                        rx={12}
                      />

                      <line
                        x1={PAD.left}
                        y1={PAD.top}
                        x2={PAD.left}
                        y2={H - PAD.bottom}
                        stroke="#94a3b8"
                        strokeWidth={1.4}
                      />
                      <line
                        x1={PAD.left}
                        y1={H - PAD.bottom}
                        x2={W - PAD.right}
                        y2={H - PAD.bottom}
                        stroke="#94a3b8"
                        strokeWidth={1.4}
                      />

                      {gridLines.map((g, idx) => (
                        <g key={`grid-${idx}`}>
                          <line
                            x1={PAD.left}
                            y1={g.yPos}
                            x2={W - PAD.right}
                            y2={g.yPos}
                            stroke="#e2e8f0"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                          />
                          <text
                            x={PAD.left - 8}
                            y={g.yPos + 4}
                            textAnchor="end"
                            fontSize={10}
                            fill="#64748b"
                            fontFamily="'Courier New',monospace"
                          >
                            {formatCompact(g.val)}
                          </text>
                        </g>
                      ))}

                      {balanceSeries.map((series) => {
                        const vals = balanceYears.map(
                          (year) =>
                            series.points.find((p) => p.year === year)?.value ?? 0,
                        );
                        const points = vals.map((val, idx) => ({
                          x: x(idx),
                          y: y(val),
                        }));
                        const linePath = buildSmoothPath(points);
                        const areaPath = `${linePath} L ${x(vals.length - 1)} ${
                          PAD.top + chartH
                        } L ${x(0)} ${PAD.top + chartH} Z`;
                        return (
                          <g key={`series-${series.project.id}`}>
                            <path
                              d={areaPath}
                              fill={`url(#balanceGrad-${series.project.id})`}
                              filter="url(#balanceShadow)"
                            />
                            <path
                              d={linePath}
                              fill="none"
                              stroke={`url(#balanceLine-${series.project.id})`}
                              strokeWidth={3.2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              filter="url(#balanceGlow)"
                            />
                          </g>
                        );
                      })}

                      {balanceSeries.map((series) => {
                        const vals = balanceYears.map(
                          (year) =>
                            series.points.find((p) => p.year === year)?.value ?? 0,
                        );
                        return vals.map((val, idx) => {
                          const year = balanceYears[idx];
                          const isHover =
                            balanceHover?.projectId === series.project.id &&
                            balanceHover?.year === year;
                          return (
                            <g key={`pt-${series.project.id}-${year}`}>
                              <circle
                                cx={x(idx)}
                                cy={y(val)}
                                r={12}
                                fill="transparent"
                                style={{ cursor: "pointer" }}
                                onMouseEnter={() =>
                                  setBalanceHover({
                                    projectId: series.project.id,
                                    year,
                                  })
                                }
                                onMouseLeave={() => setBalanceHover(null)}
                              />
                              <circle
                                cx={x(idx)}
                                cy={y(val)}
                                r={isHover ? 6 : 3.5}
                                fill={isHover ? "#fff" : series.color}
                                stroke="#0f172a"
                                strokeWidth={2}
                                style={{ transition: "r 0.15s, fill 0.15s" }}
                              />
                            </g>
                          );
                        });
                      })}

                      {balanceHover &&
                        (() => {
                          const series = balanceSeries.find(
                            (item) => item.project.id === balanceHover.projectId,
                          );
                          if (!series) return null;
                          const yearIndex = balanceYears.indexOf(balanceHover.year);
                          if (yearIndex < 0) return null;
                          const point = series.points.find(
                            (p) => p.year === balanceHover.year,
                          );
                          if (!point) return null;
                          const tx = x(yearIndex);
                          const ty = y(point.value);
                          const boxW = 150;
                          const boxH = 58;
                          const bx = Math.min(
                            Math.max(tx - boxW / 2, PAD.left),
                            W - PAD.right - boxW,
                          );
                          const by = Math.max(ty - boxH - 14, 4);
                          return (
                            <g pointerEvents="none">
                              <rect
                                x={bx}
                                y={by}
                                width={boxW}
                                height={boxH}
                                rx={10}
                        fill="#e2e8f0"
                        stroke={series.color}
                        strokeWidth={1.5}
                      />
                              <rect
                                x={bx + 10}
                                y={by + 12}
                                width={8}
                                height={8}
                                rx={2}
                                fill={series.color}
                              />
                              <text
                                x={bx + 24}
                                y={by + 19}
                                fontSize={11}
                                fill={series.color}
                                fontFamily="'Georgia',serif"
                                fontWeight={600}
                              >
                                {series.project.name}
                              </text>
                              <text
                                x={bx + boxW / 2}
                                y={by + 38}
                                textAnchor="middle"
                                fontSize={11}
                                fill="#64748b"
                                fontFamily="'Courier New',monospace"
                              >
                                {balanceHover.year}
                              </text>
                              <text
                                x={bx + boxW / 2}
                                y={by + 52}
                                textAnchor="middle"
                                fontSize={13}
                                fill="#f1f5f9"
                                fontFamily="'Georgia',serif"
                                fontWeight={700}
                              >
                                {formatFull(point.value)}
                              </text>
                            </g>
                          );
                        })()}

                      {balanceYears.map((year, idx) => (
                        <text
                          key={`year-${year}`}
                          x={x(idx)}
                          y={H - PAD.bottom + 20}
                          textAnchor="middle"
                          fontSize={12}
                        fill="#64748b"
                        fontFamily="'Georgia',serif"
                        fontWeight={600}
                      >
                        {year}
                      </text>
                    ))}

                    <text
                      x={14}
                      y={H / 2}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#64748b"
                      fontFamily="'Courier New',monospace"
                      transform={`rotate(-90, 14, ${H / 2})`}
                    >
                      {t("dashboard.balanceHistory.axisLabel")}
                    </text>
                  </svg>
                </Box>
              );
            })()}
          </Box>

          <Box
            bg={balanceTableBg}
            border="1px solid"
            borderColor={tableHeadBg}
            borderRadius="18px"
            px={4}
            py={4}
          >
            <Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={2}>
              <Text
                fontSize="xs"
                color={subtleText}
                textTransform="uppercase"
                letterSpacing="2px"
                fontFamily="'Courier New',monospace"
              >
                {t("dashboard.balanceHistory.tableTitle")}
              </Text>
              <Badge
                variant="subtle"
                colorScheme="green"
                fontSize="xs"
                letterSpacing="0.08em"
                textTransform="uppercase"
              >
                {balanceYears.length} años
              </Badge>
            </Flex>
            <Box overflowX="auto">
              <Table
                size="sm"
                variant="simple"
                minW="640px"
                sx={{
                  "tbody tr:nth-of-type(odd)": {
                    bg: balanceTableRowOddBg,
                  },
                  "tbody tr:hover": {
                    bg: balanceTableRowHoverBg,
                  },
                  "th, td": { borderColor: balanceTableBorderColor },
                }}
              >
                <Thead bg={balanceTableHeadBg}>
                  <Tr>
                    <Th
                      textAlign="left"
                      fontSize="xs"
                      color={balanceTableHeadText}
                      textTransform="uppercase"
                      letterSpacing="1.4px"
                      fontFamily="'Courier New',monospace"
                    >
                      {t("dashboard.balanceHistory.tableYear")}
                    </Th>
                    {balanceSeries.map((series) => (
                      <Th
                        key={`head-${series.project.id}`}
                        textAlign="right"
                        fontSize="xs"
                        color={series.color}
                        textTransform="uppercase"
                        letterSpacing="1.2px"
                        fontFamily="'Courier New',monospace"
                        borderBottom={`2px solid ${series.color}55`}
                      >
                        {series.project.name}
                      </Th>
                    ))}
                    <Th
                      textAlign="right"
                      fontSize="xs"
                      color={balanceTableHeadText}
                      textTransform="uppercase"
                      letterSpacing="1.2px"
                      fontFamily="'Courier New',monospace"
                    >
                      {t("dashboard.balanceHistory.tableTotal")}
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {balanceYears.map((year) => {
                    const total = balanceTotalsByYear[year] ?? 0;
                    return (
                      <Tr key={`row-${year}`}>
                        <Td
                          py={3}
                          color={balanceTableYearText}
                          fontFamily="'Georgia',serif"
                          fontWeight={600}
                        >
                          <HStack spacing={2}>
                            <Box
                              w="8px"
                              h="8px"
                              borderRadius="full"
                              bg={statAccent}
                              flexShrink={0}
                            />
                            <Text>{year}</Text>
                          </HStack>
                        </Td>
                        {balanceSeries.map((series) => {
                          const value =
                            series.points.find((p) => p.year === year)?.value ?? 0;
                          return (
                            <Td
                              key={`cell-${series.project.id}-${year}`}
                              textAlign="right"
                              py={3}
                            >
                              <Text
                                color={balanceTableTotalText}
                                fontFamily="'Courier New',monospace"
                                fontWeight={700}
                                fontSize="sm"
                              >
                                {formatFull(value)}
                              </Text>
                            </Td>
                          );
                        })}
                        <Td textAlign="right" py={3}>
                          <Text
                            color="#f97316"
                            fontFamily="'Courier New',monospace"
                            fontWeight={800}
                            fontSize="sm"
                          >
                            {formatFull(total)}
                          </Text>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </Box>
        </>
      )}
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5} mb={8}>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>{t("dashboard.stats.tenantsActive")}</StatLabel>
            <StatNumber>{summary?.tenants_activos ?? "-"}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>{t("dashboard.stats.usersActive")}</StatLabel>
            <StatNumber>{summary?.usuarios_activos ?? "-"}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>{t("dashboard.stats.toolsActive")}</StatLabel>
            <StatNumber>{summary?.herramientas_activas ?? "-"}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>{t("dashboard.stats.hoursToday")}</StatLabel>
            <StatNumber>
              {summary ? summary.horas_hoy.toFixed(2) : "0.00"} h
            </StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>{t("dashboard.stats.ticketsOpen")}</StatLabel>
            <StatNumber>{summary?.tickets_abiertos ?? 0}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>{t("dashboard.stats.ticketsInProgress")}</StatLabel>
            <StatNumber>{summary?.tickets_en_progreso ?? 0}</StatNumber>
          </Stat>
        </Box>
      </SimpleGrid>

      <Box borderWidth="1px" borderRadius="lg" bg={cardBg} p={4} mb={8}>
        <HStack
          spacing={4}
          align="flex-start"
          justify="space-between"
          flexWrap="wrap"
        >
          <Box maxW="sm">
            <Text fontWeight="semibold" mb={1}>
              {t("dashboard.actions.title")}
            </Text>
            <Text fontSize="sm" color={subtleText}>
              {t("dashboard.actions.subtitle")}
            </Text>
          </Box>
          <HStack spacing={2} flexWrap="wrap" justify="flex-end">
            {isSuperAdmin && (
              <Button
                as={Link}
                to="/tenant-settings"
                size="sm"
                colorScheme="green"
                variant="outline"
              >
                {t("dashboard.actions.manageTenants")}
              </Button>
            )}
            <Button
              as={Link}
              to="/users"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              {t("dashboard.actions.manageUsers")}
            </Button>
            {canCreateTimeReports && (
              <Button
                as={Link}
                to="/time-report"
                size="sm"
                colorScheme="green"
                variant="outline"
              >
                {t("dashboard.actions.viewTimeReport")}
              </Button>
            )}
            <Button
              as={Link}
              to="/support"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              {t("dashboard.actions.viewTickets")}
            </Button>
            <Button
              as={Link}
              to="/tools"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              {t("dashboard.actions.viewTools")}
            </Button>
          </HStack>
        </HStack>
      </Box>

      <Heading as="h2" size="md" mb={4}>
        {t("dashboard.report.title")}
      </Heading>
      <Box
        borderWidth="1px"
        borderRadius="xl"
        bg={panelBg}
        p={6}
        mb={6}
      >
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
          <FormControl>
            <FormLabel>{t("dashboard.report.project")}</FormLabel>
            <Select
              placeholder={
                isLoadingProjects
                  ? t("dashboard.report.loadingProjects")
                  : t("dashboard.report.allProjects")
              }
              value={selectedProjectId ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedProjectId(value ? Number(value) : null);
              }}
              isDisabled={isLoadingProjects}
            >
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>{t("dashboard.report.from")}</FormLabel>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>{t("dashboard.report.to")}</FormLabel>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>{t("dashboard.report.userContains")}</FormLabel>
            <Input
              placeholder={t("dashboard.report.userPlaceholder")}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
          </FormControl>
        </SimpleGrid>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            {t("dashboard.report.totalHours")}
          </Text>
          <Heading size="md">{reportHours.toFixed(2)} h</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            {t("dashboard.report.entries")}
          </Text>
          <Heading size="md">{filteredReportRows.length}</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            {t("dashboard.report.status")}
          </Text>
          <Badge mt={2} colorScheme={filteredReportRows.length > 0 ? "green" : "gray"}>
            {filteredReportRows.length > 0 ? t("dashboard.report.statusReady") : t("dashboard.report.statusEmpty")}
          </Badge>
        </Box>
      </SimpleGrid>

      <Box
        borderWidth="1px"
        borderRadius="xl"
        bg={cardBg}
        overflowX="auto"
        overflowY="hidden"
        borderColor={statAccent}
        mb={8}
      >
        <Table size="sm" minW="760px">
          <Thead bg={tableHeadBg}>
            <Tr>
              <Th>{t("dashboard.table.project")}</Th>
              <Th>{t("dashboard.table.task")}</Th>
              <Th>{t("dashboard.table.user")}</Th>
              <Th isNumeric>{t("dashboard.table.rate")}</Th>
              <Th isNumeric>{t("dashboard.table.hours")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredReportRows.length === 0 ? (
              <Tr>
                <Td colSpan={5}>
                  <Text fontSize="sm" color={subtleText}>
                    {t("dashboard.table.empty")}
                  </Text>
                </Td>
              </Tr>
            ) : (
              filteredReportRows.map((row, index) => (
                <Tr key={`${row.project_id}-${row.task_id}-${row.user_id}-${index}`}>
                  <Td>{row.project_name}</Td>
                  <Td>{row.task_title}</Td>
                  <Td>{row.username ?? t("dashboard.table.unassignedUser")}</Td>
                  <Td isNumeric>
                    {row.hourly_rate ? Number(row.hourly_rate).toFixed(2) : "-"}
                  </Td>
                  <Td isNumeric>{Number(row.total_hours).toFixed(2)}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>

      <Heading as="h2" size="md" mb={4}>
        {t("dashboard.tools.title")}
      </Heading>
      <Text mb={4} fontSize="sm" color={subtleText}>
        {t("dashboard.tools.subtitle")}
      </Text>

      {isLoading && <Text>{t("dashboard.tools.loading")}</Text>}

      {!isLoading && tools && <ToolGrid tools={tools} onLaunch={handleLaunch} />}

      {launchUrl && selectedTool && (
        <Box
          mt={8}
          borderWidth="1px"
          borderRadius="lg"
          overflow="hidden"
          bg={cardBg}
        >
          <Box px={4} py={2} borderBottomWidth="1px">
            <Text fontWeight="semibold" fontSize="sm">
              {selectedTool.name}
            </Text>
            <Text fontSize="xs" color={subtleText}>
              {selectedTool.description ??
                t("dashboard.tools.embeddedFallback")}
            </Text>
            {selectedTool.slug === "erp" && (
              <Text fontSize="xs" color={subtleText} mt={1}>
                {t("dashboard.tools.erpNote")}
              </Text>
            )}
          </Box>
          <Box h={{ base: "70vh", md: "75vh", lg: "80vh" }}>
            <iframe
              src={launchUrl}
              width="100%"
              height="100%"
              style={{ border: "none" }}
              title={selectedTool.name}
            />
          </Box>
        </Box>
      )}
    </AppShell>
  );
};
