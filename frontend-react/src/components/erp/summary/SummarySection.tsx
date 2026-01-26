
import React from "react";

import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Thead,
  Th,
  Tr,
  Tag,
  VStack,
  Wrap,
} from "@chakra-ui/react";

import type { EmployeeAllocation, EmployeeProfile, Department } from "../../../api/hr";
import { DEPARTMENT_COLOR_SCHEMES } from "../../../utils/erp";

type SummaryMilestone = { label: string; hours: number };

type DepartmentUsage = {
  departmentId: number;
  departmentName: string;
  limitPercent: number;
  usedPercent: number;
  limitHours: number;
  usedHours: number;
};

interface SummarySectionProps {
  summaryYear: number;
  subtleText: string;
  loadingSummaryYear: boolean;
  saveStatusLabel?: string;
  summarySearch: string;
  onSummarySearchChange: (value: string) => void;
  departmentFilter: "all" | number;
  onDepartmentFilterChange: (value: "all" | number) => void;
  hrDepartments: Department[];
  yearOptions: number[];
  onSummaryYearChange: (value: number) => void;
  onRefreshAllocations: () => void;
  summaryEditMode: boolean;
  onToggleSummaryEdit: () => void;
  departmentColorMap: Record<number, string>;
  projectColumns: Array<{ id: number; name: string }>;
  summaryMilestones: Record<number, SummaryMilestone[]>;
  onAddSummaryMilestone: (projectId: number) => void;
  onRemoveSummaryMilestone: (projectId: number, index: number) => void;
  projectJustify: Record<number, number>;
  onProjectJustifyChange: (projectId: number, value: number) => void;
  projectJustified: Record<number, number>;
  filteredSummaryEmployees: EmployeeProfile[];
  employeeAvailability: Record<number, number>;
  departmentMap: Record<number, string>;
  employeeDepartmentPercentages: Record<number, DepartmentUsage[]>;
  allocationKey: (
    employeeId: number,
    projectId: number,
    year: number,
    milestoneLabel?: string,
  ) => string;
  allocationIndex: Map<string, EmployeeAllocation>;
  allocationDraftsState: Record<string, string>;
  onAllocationDraftChange: (key: string, value: string) => void;
  onAllocationBlur: (
    employee: EmployeeProfile,
    projectId: number,
    milestoneLabel: string,
    value: string,
  ) => void;
  isAddModalOpen: boolean;
  onCloseAddModal: () => void;
  hrTenantId: number | null;
  hrEmployees: EmployeeProfile[];
  selectedEmployeeIds: number[];
  employeesLoading: boolean;
  departmentsLoading: boolean;
  employeesError: boolean;
  departmentsError: boolean;
  employeesErrorMsg?: unknown;
  departmentsErrorMsg?: unknown;
  onRetryEmployeesDepartments: () => void;
  addDrawerDeptFilter: "all" | number;
  onAddDrawerDeptFilterChange: (value: "all" | number) => void;
  addDrawerSearch: string;
  onAddDrawerSearchChange: (value: string) => void;
  employeesAvailableToAdd: EmployeeProfile[];
  onAddEmployee: (employeeId: number) => void;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  summaryYear,
  subtleText,
  loadingSummaryYear,
  saveStatusLabel,
  summarySearch,
  onSummarySearchChange,
  departmentFilter,
  onDepartmentFilterChange,
  hrDepartments,
  yearOptions,
  onSummaryYearChange,
  onRefreshAllocations,
  summaryEditMode,
  onToggleSummaryEdit,
  departmentColorMap,
  projectColumns,
  summaryMilestones,
  onAddSummaryMilestone,
  onRemoveSummaryMilestone,
  projectJustify,
  onProjectJustifyChange,
  projectJustified,
  filteredSummaryEmployees,
  employeeAvailability,
  departmentMap,
  employeeDepartmentPercentages,
  allocationKey,
  allocationIndex,
  allocationDraftsState,
  onAllocationDraftChange,
  onAllocationBlur,
  isAddModalOpen,
  onCloseAddModal,
  hrTenantId,
  hrEmployees,
  selectedEmployeeIds,
  employeesLoading,
  departmentsLoading,
  employeesError,
  departmentsError,
  employeesErrorMsg,
  departmentsErrorMsg,
  onRetryEmployeesDepartments,
  addDrawerDeptFilter,
  onAddDrawerDeptFilterChange,
  addDrawerSearch,
  onAddDrawerSearchChange,
  employeesAvailableToAdd,
  onAddEmployee,
}) => (
  <Stack spacing={5} minW="0">
    <Flex align="center" justify="space-between" gap={4} flexWrap="wrap">
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
          Tablero tipo Excel con horas a justificar, justificadas y asignacion
          por empleado.
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
            onChange={(e) => onSummarySearchChange(e.target.value)}
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
              onDepartmentFilterChange(
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
              onSummaryYearChange(
                Number.isFinite(parsed) ? parsed : new Date().getFullYear(),
              );
            }}
          >
            {yearOptions.map((y) => (
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
          onClick={onRefreshAllocations}
        >
          Refrescar
        </Button>

        <Button
          size="sm"
          variant={summaryEditMode ? "solid" : "outline"}
          colorScheme={summaryEditMode ? "green" : "gray"}
          onClick={onToggleSummaryEdit}
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
      <Box w="100%" maxW="100%" minW="0" overflowX="auto" overflowY="hidden">
        <Table size="sm" variant="simple" minW="1400px" w="max-content">
          <Thead>
            <Tr bg="gray.200">
              <Th minW="60px">No</Th>
              <Th minW="170px">Nombre</Th>
              <Th minW="190px">Apellidos</Th>
              <Th minW="130px">Departamento</Th>
              {projectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
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
                        onClick={() => onAddSummaryMilestone(p.id)}
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
              <Th textAlign="center" bg="green.700" color="white" minW="140px">
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
              <Th textAlign="center" bg="red.600" color="white" minW="150px">
                Horas disponibles para {summaryYear}
              </Th>
            </Tr>

            <Tr bg="gray.50" borderBottomWidth="1px">
              <Th bg="gray.50" colSpan={4} textAlign="left">
                Horas a justificar
              </Th>
              {projectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
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
                        onProjectJustifyChange(
                          p.id,
                          Number(e.target.value || 0),
                        )
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
                const count = (summaryMilestones[p.id] ?? []).length || 1;
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
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                const falt =
                  (projectJustify[p.id] ?? 0) - (projectJustified[p.id] ?? 0);
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

            <Tr bg="blue.100" borderBottomWidth="2px" borderColor="blue.200">
              <Th bg="blue.100" colSpan={4} textAlign="left" color="blue.700">
                % Ejecutado en {summaryYear}
              </Th>
              {projectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                const justify = projectJustify[p.id] ?? 0;
                const just = projectJustified[p.id] ?? 0;
                const pct = justify > 0 ? Math.round((just / justify) * 100) : 0;
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

            <Tr bg="green.50" borderBottomWidth="2px" borderColor="green.200">
              <Th bg="green.50" colSpan={4} textAlign="left" color="green.700">
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
                  <Th key={`${p.id}-ms-${idx}`} textAlign="center" p={2}>
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
                        onClick={() => onRemoveSummaryMilestone(p.id, idx)}
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
                const deptColor = departmentColorMap[deptId] ?? "gray";
                const bgColor =
                  idx % 2 === 0 ? `${deptColor}.50` : `${deptColor}.100`;

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
                      {emp.full_name?.split(" ").slice(1).join(" ") || "-"}
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
                            {departmentMap[emp.primary_department_id ?? -1] ??
                              "Sin departamento"}
                          </Text>
                          {(() => {
                            const usage =
                              (employeeDepartmentPercentages[emp.id] ?? []).find(
                                (entry) =>
                                  entry.departmentId ===
                                  emp.primary_department_id,
                              ) ?? employeeDepartmentPercentages[emp.id]?.[0];
                            if (!usage) return null;
                            return (
                              <Text fontSize="xx-small" color="gray.500">
                                {usage.usedPercent}% usado /{" "}
                                {usage.limitPercent}% cuota ({usage.usedHours}h/
                                {usage.limitHours}h)
                              </Text>
                            );
                          })()}
                        </VStack>
                      </Flex>
                    </Td>

                    {projectColumns.map((p) => {
                      const count = (summaryMilestones[p.id] ?? []).length || 1;
                      const key = allocationKey(emp.id, p.id, summaryYear);
                      const existing = allocationIndex.get(key);
                      const value =
                        allocationDraftsState[key] ??
                        existing?.allocated_hours?.toString() ??
                        "";
                      const numericValue = Number(
                        value || existing?.allocated_hours || 0,
                      );
                      totalEmpAllocated += Number.isFinite(numericValue)
                        ? numericValue
                        : 0;

                      if (count === 0) {
                        return (
                          <Td key={`${emp.id}-${p.id}-empty`} textAlign="center">
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
                        const cellExisting = allocationIndex.get(cellKey);
                        const cellValue =
                          allocationDraftsState[cellKey] ??
                          cellExisting?.allocated_hours?.toString() ??
                          "";

                        cells.push(
                          <Td key={`${emp.id}-${p.id}-${mIdx}`} textAlign="center">
                            {summaryEditMode ? (
                              <Input
                                size="sm"
                                type="number"
                                min={0}
                                value={cellValue}
                                onChange={(e) =>
                                  onAllocationDraftChange(
                                    cellKey,
                                    e.target.value,
                                  )
                                }
                                onBlur={(e) =>
                                  onAllocationBlur(
                                    emp,
                                    p.id,
                                    milestoneLabel,
                                    e.target.value,
                                  )
                                }
                                textAlign="center"
                              />
                            ) : (
                              <Text>{cellExisting?.allocated_hours ?? 0} h</Text>
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
                        available - totalEmpAllocated < 0 ? "red.50" : "green.50"
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
    </Box>
    <Modal isOpen={isAddModalOpen} onClose={onCloseAddModal} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Agregar empleados</ModalHeader>
        <ModalBody>
          <Stack spacing={3}>
            <Box
              p={2}
              bg="gray.100"
              borderRadius="md"
              fontSize="xs"
              display="none"
            >
              <Text>Tenant ID: {hrTenantId ?? "undefined"}</Text>
              <Text>Empleados cargados: {hrEmployees.length}</Text>
              <Text>Departamentos cargados: {hrDepartments.length}</Text>
              <Text>Empleados seleccionados: {selectedEmployeeIds.length}</Text>
              <Text>Cargando empleados: {employeesLoading ? "si" : "no"}</Text>
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
                  onClick={onRetryEmployeesDepartments}
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
                    onClick={onRetryEmployeesDepartments}
                  >
                    Recargar datos
                  </Button>
                </Box>
              )}

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
                  onAddDrawerDeptFilterChange(
                    value === "all" ? "all" : Number(value),
                  );
                }}
              >
                <option value="all">Todos los departamentos</option>
                {hrDepartments.map((dept) => (
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
                onChange={(e) => onAddDrawerSearchChange(e.target.value)}
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
                    DEPARTMENT_COLOR_SCHEMES[deptIndex >= 0 ? deptIndex : 0];
                  const deptName = departmentMap[deptId] ?? "Sin departamento";

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
                        onClick={() => onAddEmployee(emp.id)}
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
          {Object.values(projectJustify).reduce((a, b) => a + (b || 0), 0)} h
        </Heading>
      </Box>

      <Box p={4} borderRadius="lg" bg="white" borderWidth="1px">
        <Text fontSize="xs" color={subtleText}>
          Justificadas
        </Text>
        <Heading size="lg" color="green.600">
          {Object.values(projectJustified).reduce((a, b) => a + (b || 0), 0)} h
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
);
