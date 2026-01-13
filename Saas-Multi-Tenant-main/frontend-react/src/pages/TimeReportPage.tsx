import React, { useState } from "react";
import {
  Box,
  Badge,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useToast,
  Stack,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

import {
  ErpProject,
  fetchErpProjects,
  fetchTimeReport,
  TimeReportRow,
} from "../api/erpReports";
import { AppShell } from "../components/layout/AppShell";

export const TimeReportPage: React.FC = () => {
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const accent = useColorModeValue("brand.500", "brand.300");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [projects, setProjects] = useState<ErpProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [rows, setRows] = useState<TimeReportRow[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  const loadProjectsIfNeeded = async () => {
    if (projects.length > 0 || isLoadingProjects) return;
    try {
      setIsLoadingProjects(true);
      const data = await fetchErpProjects();
      setProjects(data);
    } catch (error: any) {
      toast({
        title: "Error al cargar proyectos",
        description:
          error?.response?.data?.detail ??
          "No se han podido cargar los proyectos del ERP.",
        status: "error",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoadingReport(true);
      const data = await fetchTimeReport({
        projectId: selectedProjectId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      setRows(data);
    } catch (error: any) {
      toast({
        title: "Error al generar informe",
        description:
          error?.response?.data?.detail ??
          "No se ha podido generar el informe de horas.",
        status: "error",
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  const normalizedFilter = userFilter.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (!normalizedFilter) return true;
    const haystack = `${row.username ?? ""}`.toLowerCase();
    return haystack.includes(normalizedFilter);
  });

  const totalHours = filteredRows.reduce(
    (acc, row) => acc + Number(row.total_hours),
    0,
  );
  const reportCount = filteredRows.length;

  const handleExportCsv = () => {
    if (filteredRows.length === 0) {
      toast({
        title: "Sin datos para exportar",
        description: "Genera primero un informe con resultados.",
        status: "info",
      });
      return;
    }

    const header = ["Proyecto", "Tarea", "Usuario", "Coste/hora", "Horas"];
    const lines = [
      header.join(";"),
      ...filteredRows.map((row) =>
        [
          row.project_name,
          row.task_title,
          row.username ?? "",
          row.hourly_rate ? Number(row.hourly_rate).toFixed(2) : "",
          Number(row.total_hours).toFixed(2),
        ].join(";"),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "informe_horas.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            Informe de horas
          </Text>
          <Heading size="lg">Analiza productividad por proyecto y usuario</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Filtra por fechas, proyectos y usuarios para tomar decisiones con datos.
          </Text>
        </Stack>
      </Box>

      <Box
        as="form"
        onSubmit={handleGenerateReport}
        borderWidth="1px"
        borderRadius="xl"
        bg={panelBg}
        p={6}
        mb={8}
        w="100%"
      >
        <Heading as="h3" size="sm" mb={4}>
          Filtros del informe
        </Heading>
        <Stack spacing={4}>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
            <FormControl>
              <FormLabel>Proyecto</FormLabel>
              <Select
                placeholder={
                  isLoadingProjects ? "Cargando proyectos..." : "Todos los proyectos"
                }
                value={selectedProjectId ?? ""}
                onFocus={loadProjectsIfNeeded}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedProjectId(val ? Number(val) : null);
                }}
                isDisabled={isLoadingProjects}
              >
                {projects.map((project) => (
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
                placeholder="Ej: jmiralles, dios@..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
            </FormControl>
          </SimpleGrid>
          <Box display="flex" justifyContent="flex-end" gap={2}>
            <Button
              type="submit"
              colorScheme="green"
              isLoading={isLoadingReport}
            >
              Generar informe
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              isDisabled={filteredRows.length === 0}
            >
              Exportar CSV
            </Button>
          </Box>
        </Stack>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Total de horas
          </Text>
          <Heading size="md">{totalHours.toFixed(2)} h</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Entradas encontradas
          </Text>
          <Heading size="md">{reportCount}</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Estado
          </Text>
          <Badge mt={2} colorScheme={reportCount > 0 ? "green" : "gray"}>
            {reportCount > 0 ? "Datos listos" : "Sin datos"}
          </Badge>
        </Box>
      </SimpleGrid>

      <Box
        borderWidth="1px"
        borderRadius="xl"
        bg={cardBg}
        overflowX="auto"
        overflowY="hidden"
        borderColor={accent}
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
            {filteredRows.length === 0 ? (
              <Tr>
                <Td colSpan={5}>
                  <Text fontSize="sm" color="gray.500">
                    Aún no hay datos para los filtros seleccionados.
                  </Text>
                </Td>
              </Tr>
            ) : (
              filteredRows.map((row, index) => (
                <Tr key={`${row.project_id}-${row.task_id}-${row.user_id}-${index}`}>
                  <Td>{row.project_name}</Td>
                  <Td>{row.task_title}</Td>
                  <Td>{row.username ?? "Usuario no asignado"}</Td>
                  <Td isNumeric>{row.hourly_rate ? Number(row.hourly_rate).toFixed(2) : "-"}</Td>
                  <Td isNumeric>{Number(row.total_hours).toFixed(2)}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>
    </AppShell>
  );
};




