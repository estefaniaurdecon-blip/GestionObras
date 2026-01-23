import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
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
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { fetchTenantTools, launchTool, Tool } from "../api/tools";
import { fetchDashboardSummary, type DashboardSummary } from "../api/dashboard";
import {
  fetchErpProjects,
  fetchTimeReport,
  type ErpProject,
  type TimeReportRow,
} from "../api/erpReports";
import { AppShell } from "../components/layout/AppShell";
import { ToolGrid } from "../components/tools/ToolGrid";
import { useCurrentUser } from "../hooks/useCurrentUser";

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const addDays = (value: Date, days: number) => {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
};

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
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id ?? 1;
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(() =>
    formatDate(addDays(new Date(), -6)),
  );
  const [dateTo, setDateTo] = useState(() => formatDate(new Date()));
  const [userFilter, setUserFilter] = useState("");

  const { data: projects, isLoading: isLoadingProjects } = useQuery<
    ErpProject[]
  >({
    queryKey: ["dashboard-erp-projects"],
    queryFn: fetchErpProjects,
  });

  const reportQuery = useQuery<TimeReportRow[]>({
    queryKey: ["dashboard-time-report", selectedProjectId, dateFrom, dateTo],
    queryFn: () =>
      fetchTimeReport({
        projectId: selectedProjectId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      }),
    onError: (error: any) => {
      const message =
        error?.response?.data?.detail ??
        t("dashboard.messages.reportLoadFallback");
      toast({
        title: t("dashboard.messages.reportLoadTitle"),
        description: message,
        status: "error",
      });
    },
  });

  const reportRows = reportQuery.data ?? [];
  const filteredReportRows = useMemo(() => {
    const normalized = userFilter.trim().toLowerCase();
    if (!normalized) return reportRows;
    return reportRows.filter((row) =>
      `${row.username ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [reportRows, userFilter]);

  const reportHours = useMemo(
    () =>
      filteredReportRows.reduce(
        (acc, row) => acc + Number(row.total_hours || 0),
        0,
      ),
    [filteredReportRows],
  );

  const { data: tools, isLoading } = useQuery<Tool[]>({
    queryKey: ["tenant-tools", tenantId],
    queryFn: () => fetchTenantTools(tenantId),
  });

  const handleLaunch = async (tool: Tool) => {
    try {
      if (tool.slug === "erp") {
        setLaunchUrl(null);
        setSelectedTool(null);
        navigate({ to: "/erp/projects" });
        return;
      }

      setSelectedTool(tool);
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
        <Stack position="relative" spacing={3}>
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            {t("dashboard.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("dashboard.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("dashboard.header.subtitle")}
          </Text>
        </Stack>
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
            <Button
              as={Link}
              to="/time-report"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              {t("dashboard.actions.viewTimeReport")}
            </Button>
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
