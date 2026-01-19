import React, { useMemo, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Checkbox,
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
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import {
  ErpProject,
  fetchErpProjects,
  fetchTimeReport,
  TimeReportRow,
} from "../api/erpReports";
import { fetchEmployees, type EmployeeProfile } from "../api/hr";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";

export const TimeReportPage: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation();
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
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id ?? undefined;

  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<EmployeeProfile[]>({
    queryKey: ["hr-employees", tenantId ?? "all"],
    queryFn: () => fetchEmployees(tenantId),
  });

  const loadProjectsIfNeeded = async () => {
    if (projects.length > 0 || isLoadingProjects) return;
    try {
      setIsLoadingProjects(true);
      const data = await fetchErpProjects();
      setProjects(data);
    } catch (error: any) {
      toast({
        title: t("timeReport.messages.loadProjectsTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeReport.messages.loadProjectsFallback"),
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
        userIds: selectedEmployeeIds.length > 0 ? selectedEmployeeIds : null,
      });
      setRows(data);
    } catch (error: any) {
      toast({
        title: t("timeReport.messages.reportErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeReport.messages.reportErrorFallback"),
        status: "error",
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  const normalizedFilter = userFilter.trim().toLowerCase();
  const employeeIdSet = useMemo(
    () => new Set(selectedEmployeeIds),
    [selectedEmployeeIds]
  );

  const filteredRows = rows.filter((row) => {
    if (selectedEmployeeIds.length > 0) {
      if (!row.user_id || !employeeIdSet.has(row.user_id)) return false;
    }
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
        title: t("timeReport.messages.exportEmptyTitle"),
        description: t("timeReport.messages.exportEmptyDesc"),
        status: "info",
      });
      return;
    }

    const header = [
      t("timeReport.table.project"),
      t("timeReport.table.task"),
      t("timeReport.table.user"),
      t("timeReport.table.rate"),
      t("timeReport.table.hours"),
    ];
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
    link.download = t("timeReport.export.fileName");
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
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">{t("timeReport.header.eyebrow")}</Text>
          <Heading size="lg">{t("timeReport.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("timeReport.header.subtitle")}
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
          {t("timeReport.filters.title")}
        </Heading>
        <Stack spacing={4}>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
            <FormControl>
              <FormLabel>{t("timeReport.filters.project")}</FormLabel>
              <Select
                placeholder={
                  isLoadingProjects
                    ? t("timeReport.filters.loadingProjects")
                    : t("timeReport.filters.allProjects")
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
              <FormLabel>{t("timeReport.filters.from")}</FormLabel>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t("timeReport.filters.to")}</FormLabel>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t("timeReport.filters.userContains")}</FormLabel>
              <Button
                variant="outline"
                colorScheme="green"
                onClick={() => setEmployeeModalOpen(true)}
                size="sm"
                minW={{ base: "100%", md: "200px" }}
                isLoading={isLoadingEmployees}
              >
                Seleccionar empleados
              </Button>
              {selectedEmployeeIds.length > 0 && (
                <Stack direction="row" spacing={2} mt={2} flexWrap="wrap">
                  {selectedEmployeeIds.map((id) => {
                    const emp = employees.find((e) => (e.user_id ?? e.id) === id);
                    const label = emp?.full_name || emp?.email || `#${id}`;
                    return (
                      <Badge
                        key={id}
                        colorScheme="green"
                        borderRadius="full"
                        px={2}
                        py={1}
                        cursor="pointer"
                        onClick={() =>
                          setSelectedEmployeeIds((prev) => prev.filter((x) => x !== id))
                        }
                      >
                        {label} ✕
                      </Badge>
                    );
                  })}
                </Stack>
              )}
            </FormControl>
          </SimpleGrid>
          <Box display="flex" justifyContent="flex-end" gap={2}>
            <Button
              type="submit"
              colorScheme="green"
              isLoading={isLoadingReport}
            >{t("timeReport.filters.submit")}</Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              isDisabled={filteredRows.length === 0}
            >{t("timeReport.filters.export")}</Button>
          </Box>
        </Stack>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>{t("timeReport.stats.totalHours")}</Text>
          <Heading size="md">{totalHours.toFixed(2)} h</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>{t("timeReport.stats.entries")}</Text>
          <Heading size="md">{reportCount}</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>{t("timeReport.stats.status")}</Text>
          <Badge mt={2} colorScheme={reportCount > 0 ? "green" : "gray"}>
            {reportCount > 0
              ? t("timeReport.stats.statusReady")
              : t("timeReport.stats.statusEmpty")}
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
              <Th>{t("timeReport.filters.project")}</Th>
              <Th>{t("timeReport.table.task")}</Th>
              <Th>{t("timeReport.table.user")}</Th>
              <Th isNumeric>{t("timeReport.table.rate")}</Th>
              <Th isNumeric>{t("timeReport.table.hours")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredRows.length === 0 ? (
              <Tr>
                <Td colSpan={5}>
                  <Text fontSize="sm" color="gray.500">                    {t("timeReport.table.empty")}
                  </Text>
                </Td>
              </Tr>
            ) : (
              filteredRows.map((row, index) => (
                <Tr key={`${row.project_id}-${row.task_id}-${row.user_id}-${index}`}>
                  <Td>{row.project_name}</Td>
                  <Td>{row.task_title}</Td>
                  <Td>{row.username ?? t("timeReport.table.unassignedUser")}</Td>
                  <Td isNumeric>{row.hourly_rate ? Number(row.hourly_rate).toFixed(2) : "-"}</Td>
                  <Td isNumeric>{Number(row.total_hours).toFixed(2)}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>

      <Modal isOpen={employeeModalOpen} onClose={() => setEmployeeModalOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Seleccionar empleados</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Input
                placeholder="Buscar por nombre o email"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
              />
              <Box maxH="320px" overflowY="auto" borderWidth="1px" borderRadius="md" p={3}>
                <Stack spacing={2}>
                  {isLoadingEmployees && (
                    <Text fontSize="sm" color={subtleText}>
                      Cargando empleados...
                    </Text>
                  )}
                  {employees
                    .filter((emp) => {
                      const term = employeeSearch.trim().toLowerCase();
                      if (!term) return true;
                      const haystack = `${emp.full_name ?? ""} ${emp.email ?? ""}`.toLowerCase();
                      return haystack.includes(term);
                    })
                    .map((emp) => {
                      const id = emp.user_id ?? emp.id;
                      const label = emp.full_name || emp.email || `Empleado ${id}`;
                      return (
                        <Checkbox
                          key={`${id}-${emp.email}`}
                          isChecked={selectedEmployeeIds.includes(id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedEmployeeIds((prev) =>
                              checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
                            );
                          }}
                        >
                          {label}
                        </Checkbox>
                      );
                    })}
                  {employees.length === 0 && (
                    <Text fontSize="sm" color={subtleText}>
                      No hay empleados disponibles.
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEmployeeModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button colorScheme="green" onClick={() => setEmployeeModalOpen(false)}>
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={employeeModalOpen} onClose={() => setEmployeeModalOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Seleccionar empleados</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Input
                placeholder="Buscar por nombre o email"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
              />
              <Box maxH="320px" overflowY="auto" borderWidth="1px" borderRadius="md" p={3}>
                <Stack spacing={2}>
                  {employees
                    .filter((emp) => {
                      const term = employeeSearch.trim().toLowerCase();
                      if (!term) return true;
                      const haystack = `${emp.full_name ?? ""} ${emp.email ?? ""}`.toLowerCase();
                      return haystack.includes(term);
                    })
                    .map((emp) => {
                      const id = emp.user_id ?? emp.id;
                      const label = emp.full_name || emp.email || `Empleado ${id}`;
                      return (
                        <Checkbox
                          key={`${id}-${emp.email ?? ""}`}
                          isChecked={selectedEmployeeIds.includes(id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedEmployeeIds((prev) =>
                              checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
                            );
                          }}
                        >
                          {label}
                        </Checkbox>
                      );
                    })}
                  {employees.length === 0 && (
                    <Text fontSize="sm" color={subtleText}>
                      No hay empleados disponibles.
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEmployeeModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button colorScheme="green" onClick={() => setEmployeeModalOpen(false)}>
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </AppShell>
  );
};




