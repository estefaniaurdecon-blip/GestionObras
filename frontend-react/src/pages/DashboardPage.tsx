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
        "No se ha podido cargar el informe de horas.";
      toast({
        title: "Error al cargar informe",
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
        "No se ha podido lanzar la herramienta (revisa permisos y configuracion).";
      toast({
        title: "Error al lanzar herramienta",
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
            Panel principal
          </Text>
          <Heading size="lg">Dashboard operativo</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Resumen de actividad, accesos rapidos y seguimiento de horas clave.
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
            <StatLabel>Tenants activos</StatLabel>
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
            <StatLabel>Usuarios activos</StatLabel>
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
            <StatLabel>Herramientas activas</StatLabel>
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
            <StatLabel>Horas registradas hoy</StatLabel>
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
            <StatLabel>Tickets abiertos</StatLabel>
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
            <StatLabel>Tickets en progreso</StatLabel>
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
              Acciones rapidas
            </Text>
            <Text fontSize="sm" color={subtleText}>
              Gestiona tu organizacion y accede al ERP, Moodle y las
              herramientas clave de la plataforma.
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
                Crear / gestionar tenants
              </Button>
            )}
            <Button
              as={Link}
              to="/users"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Gestionar usuarios
            </Button>
            <Button
              as={Link}
              to="/time-report"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Ver informe de horas
            </Button>
            <Button
              as={Link}
              to="/support"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Ver tickets
            </Button>
            <Button
              as={Link}
              to="/tools"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Ver herramientas
            </Button>
          </HStack>
        </HStack>
      </Box>

      <Heading as="h2" size="md" mb={4}>
        Informe filtrable de horas
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
            <FormLabel>Proyecto</FormLabel>
            <Select
              placeholder={
                isLoadingProjects ? "Cargando proyectos..." : "Todos los proyectos"
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
            <FormLabel>Desde</FormLabel>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Hasta</FormLabel>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Usuario (contiene)</FormLabel>
            <Input
              placeholder="Ej: jmiralles"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
          </FormControl>
        </SimpleGrid>
        <HStack justify="flex-end" mt={4}>
          <Button
            size="sm"
            colorScheme="green"
            onClick={() => reportQuery.refetch()}
            isLoading={reportQuery.isFetching}
          >
            Actualizar informe
          </Button>
        </HStack>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Total horas
          </Text>
          <Heading size="md">{reportHours.toFixed(2)} h</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Entradas
          </Text>
          <Heading size="md">{filteredReportRows.length}</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Estado
          </Text>
          <Badge mt={2} colorScheme={filteredReportRows.length > 0 ? "green" : "gray"}>
            {filteredReportRows.length > 0 ? "Datos listos" : "Sin datos"}
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
              <Th>Proyecto</Th>
              <Th>Tarea</Th>
              <Th>Usuario</Th>
              <Th isNumeric>Coste/hora</Th>
              <Th isNumeric>Horas</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredReportRows.length === 0 ? (
              <Tr>
                <Td colSpan={5}>
                  <Text fontSize="sm" color={subtleText}>
                    Aun no hay datos para los filtros seleccionados.
                  </Text>
                </Td>
              </Tr>
            ) : (
              filteredReportRows.map((row, index) => (
                <Tr key={`${row.project_id}-${row.task_id}-${row.user_id}-${index}`}>
                  <Td>{row.project_name}</Td>
                  <Td>{row.task_title}</Td>
                  <Td>{row.username ?? "Usuario no asignado"}</Td>
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
        Herramientas disponibles
      </Heading>
      <Text mb={4} fontSize="sm" color={subtleText}>
        Accede a las aplicaciones corporativas vinculadas a tu tenant.
      </Text>

      {isLoading && <Text>Cargando herramientas...</Text>}

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
                "Herramienta integrada en la plataforma."}
            </Text>
            {selectedTool.slug === "erp" && (
              <Text fontSize="xs" color={subtleText} mt={1}>
                ERP interno integrado en el dashboard para gestionar proyectos,
                tareas y control horario.
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
