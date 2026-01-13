import React, { useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
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
  VStack,
  useColorModeValue,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keyframes } from "@emotion/react";

import { AppShell } from "../components/layout/AppShell";
import {
  createDepartment,
  createEmployee,
  deleteEmployee,
  updateEmployee,
  fetchDepartments,
  fetchEmployees,
  fetchHeadcount,
  type Department,
  type EmployeeProfile,
  type HeadcountItem,
} from "../api/hr";
import {
  fetchAllTenants,
  fetchUsersByTenant,
  type CurrentUser,
  type TenantOption,
  type TenantUserSummary,
} from "../api/users";

interface DepartmentFormState {
  name: string;
  description: string;
}

interface EmployeeFormState {
  userId: number | "";
  fullName: string;
  email: string;
  hourlyRate: string;
  position: string;
  primaryDepartmentId: number | "";
}

interface EmployeeEditFormState {
  fullName: string;
  email: string;
  hourlyRate: string;
  position: string;
  primaryDepartmentId: number | "";
  isActive: boolean;
}

// Pantalla de recursos humanos: departamentos y empleados.
export const HrPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const deleteCancelRef = useRef<HTMLButtonElement>(null);

  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  let isSuperAdmin = false;
  let currentTenantId: number | null = null;
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const me = JSON.parse(raw) as CurrentUser;
      isSuperAdmin = Boolean(me.is_super_admin);
      currentTenantId = me.tenant_id ?? null;
    }
  } catch {
    isSuperAdmin = false;
    currentTenantId = null;
  }

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(
    isSuperAdmin ? null : currentTenantId
  );

  const [deptForm, setDeptForm] = useState<DepartmentFormState>({
    name: "",
    description: "",
  });

  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>({
    userId: "",
    fullName: "",
    email: "",
    hourlyRate: "",
    position: "",
    primaryDepartmentId: "",
  });
  const [editingEmployee, setEditingEmployee] =
    useState<EmployeeProfile | null>(null);
  const [employeeEditForm, setEmployeeEditForm] =
    useState<EmployeeEditFormState>({
      fullName: "",
      email: "",
      hourlyRate: "",
      position: "",
      primaryDepartmentId: "",
      isActive: true,
    });

  const {
    data: tenants,
    isLoading: isLoadingTenants,
    isError: isErrorTenants,
  } = useQuery<TenantOption[]>({
    queryKey: ["hr-tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
    onSuccess: (data) => {
      if (isSuperAdmin && !selectedTenantId && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    },
  });

  const effectiveTenantId = isSuperAdmin ? selectedTenantId : currentTenantId;

  const {
    data: departments,
    isLoading: isLoadingDepartments,
    isError: isErrorDepartments,
  } = useQuery<Department[]>({
    queryKey: ["hr-departments", effectiveTenantId],
    queryFn: () =>
      fetchDepartments(
        isSuperAdmin ? effectiveTenantId ?? undefined : undefined
      ),
    enabled: effectiveTenantId != null || !isSuperAdmin,
  });

  const {
    data: employees,
    isLoading: isLoadingEmployees,
    isError: isErrorEmployees,
  } = useQuery<EmployeeProfile[]>({
    queryKey: ["hr-employees", effectiveTenantId],
    queryFn: () =>
      fetchEmployees(isSuperAdmin ? effectiveTenantId ?? undefined : undefined),
    enabled: effectiveTenantId != null || !isSuperAdmin,
  });

  const { data: headcount, isLoading: isLoadingHeadcount } = useQuery<
    HeadcountItem[]
  >({
    queryKey: ["hr-headcount", effectiveTenantId],
    queryFn: () =>
      fetchHeadcount(isSuperAdmin ? effectiveTenantId ?? undefined : undefined),
    enabled: effectiveTenantId != null || !isSuperAdmin,
  });

  const { data: tenantUsers, isLoading: isLoadingTenantUsers } = useQuery<
    TenantUserSummary[]
  >({
    queryKey: ["hr-tenant-users", effectiveTenantId],
    queryFn: () =>
      fetchUsersByTenant(
        effectiveTenantId != null ? effectiveTenantId : currentTenantId ?? 0,
        { excludeAssigned: true }
      ),
    enabled: effectiveTenantId != null,
  });

  const createDeptMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-departments"] });
      setDeptForm({ name: "", description: "" });
      toast({
        title: "Departamento creado",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: "Error al crear departamento",
        description: "Revisa permisos y datos.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  // Mutacion para crear empleados.
  const createEmployeeMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
      setEmployeeForm({
        userId: "",
        fullName: "",
        email: "",
        hourlyRate: "",
        position: "",
        primaryDepartmentId: "",
      });
      toast({
        title: "Empleado creado",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: "Error al crear empleado",
        description: "Revisa permisos, usuario y departamento.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  // Mutacion para editar empleados.
  const updateEmployeeMutation = useMutation({
    mutationFn: updateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
      toast({
        title: "Empleado actualizado",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      handleCloseEdit();
    },
    onError: () => {
      toast({
        title: "Error al actualizar empleado",
        description: "Revisa permisos y datos.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  // Mutacion para eliminar empleados.
  const deleteEmployeeMutation = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
      toast({
        title: "Empleado eliminado",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      handleCloseEdit();
    },
    onError: () => {
      toast({
        title: "Error al eliminar empleado",
        description: "Revisa permisos y datos.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  const departmentById = useMemo(() => {
    const map = new Map<number, Department>();
    (departments ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  const assignedUserIds = useMemo(() => {
    return new Set(
      (employees ?? [])
        .map((employee) => employee.user_id)
        .filter((userId): userId is number => userId != null)
    );
  }, [employees]);

  const availableTenantUsers = useMemo(() => {
    return (tenantUsers ?? []).filter((user) => !assignedUserIds.has(user.id));
  }, [tenantUsers, assignedUserIds]);

  const handleDeptChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setDeptForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEmployeeChange = (
    event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setEmployeeForm((prev) => ({
      ...prev,
      [name]:
        name === "userId" || name === "primaryDepartmentId"
          ? value
            ? Number(value)
            : ""
          : value,
    }));
  };

  const handleEmployeeEditChange = (
    event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setEmployeeEditForm((prev) => ({
      ...prev,
      [name]:
        name === "primaryDepartmentId" ? (value ? Number(value) : "") : value,
    }));
  };

  const openEditEmployee = (employee: EmployeeProfile) => {
    setEditingEmployee(employee);
    setEmployeeEditForm({
      fullName: employee.full_name ?? "",
      email: employee.email ?? "",
      hourlyRate:
        employee.hourly_rate != null ? String(employee.hourly_rate) : "",
      position: employee.position ?? "",
      primaryDepartmentId: employee.primary_department_id ?? "",
      isActive: employee.is_active,
    });
    onOpen();
  };

  const handleCloseEdit = () => {
    setEditingEmployee(null);
    onClose();
  };

  const handleUpdateEmployee = () => {
    if (!editingEmployee) return;
    if (!employeeEditForm.primaryDepartmentId) {
      toast({
        title: "Departamento obligatorio",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    updateEmployeeMutation.mutate({
      profileId: editingEmployee.id,
      data: {
        full_name: employeeEditForm.fullName.trim() || undefined,
        email: employeeEditForm.email.trim() || undefined,
        hourly_rate: employeeEditForm.hourlyRate
          ? Number(employeeEditForm.hourlyRate)
          : undefined,
        position: employeeEditForm.position || undefined,
        primary_department_id: employeeEditForm.primaryDepartmentId,
        is_active: employeeEditForm.isActive,
      },
    });
  };

  // Confirma y elimina empleado seleccionado.
  const handleDeleteEmployee = () => {
    if (!editingEmployee) return;
    onDeleteOpen();
  };

  const confirmDeleteEmployee = () => {
    if (!editingEmployee) return;
    deleteEmployeeMutation.mutate(editingEmployee.id);
  };

  const handleCreateDepartment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!deptForm.name.trim()) {
      toast({
        title: "Nombre obligatorio",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (isSuperAdmin && !effectiveTenantId) {
      toast({
        title: "Selecciona un tenant",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    createDeptMutation.mutate({
      data: {
        name: deptForm.name.trim(),
        description: deptForm.description || undefined,
        is_active: true,
      },
      tenantId: isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
    });
  };

  const handleCreateEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeForm.primaryDepartmentId) {
      toast({
        title: "Departamento obligatorio",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (!employeeForm.userId && !employeeForm.fullName.trim()) {
      toast({
        title: "Nombre obligatorio",
        description: "Indica el nombre completo si no seleccionas usuario.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (isSuperAdmin && !effectiveTenantId) {
      toast({
        title: "Selecciona un tenant",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    createEmployeeMutation.mutate({
      data: {
        user_id: employeeForm.userId || undefined,
        full_name: employeeForm.fullName.trim() || undefined,
        email: employeeForm.email.trim() || undefined,
        hourly_rate: employeeForm.hourlyRate
          ? Number(employeeForm.hourlyRate)
          : undefined,
        position: employeeForm.position || undefined,
        employment_type: "permanent",
        primary_department_id: employeeForm.primaryDepartmentId,
        is_active: true,
      },
      tenantId: isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
    });
  };

  const totalEmployees = useMemo(
    () =>
      headcount?.reduce((acc, item) => acc + (item.total_employees || 0), 0) ??
      0,
    [headcount]
  );

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
        <VStack position="relative" align="flex-start" spacing={3}>
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            Recursos humanos
          </Text>
          <Heading size="lg">Gestiona equipos y estructura interna</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Controla departamentos, perfiles y costes desde un solo panel.
          </Text>
        </VStack>
      </Box>

      {isSuperAdmin && (
        <Box mb={6}>
          <FormControl maxW="320px">
            <FormLabel>Tenant</FormLabel>
            {isLoadingTenants && <Text>Cargando tenants...</Text>}
            {isErrorTenants && (
              <Text color="red.400">No se han podido cargar los tenants.</Text>
            )}
            {tenants && (
              <Select
                value={selectedTenantId ?? ""}
                onChange={(e) =>
                  setSelectedTenantId(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="Selecciona un tenant"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.subdomain})
                  </option>
                ))}
              </Select>
            )}
          </FormControl>
        </Box>
      )}

      {!effectiveTenantId && isSuperAdmin && (
        <Text color="gray.400" mb={6}>
          Selecciona un tenant para gestionar sus datos de RRHH.
        </Text>
      )}

      {effectiveTenantId && (
        <>
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={8}>
            <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
              <Heading as="h2" size="md" mb={4}>
                Departamentos
              </Heading>

              <VStack
                as="form"
                align="stretch"
                spacing={3}
                mb={4}
                onSubmit={handleCreateDepartment}
              >
                <FormControl isRequired>
                  <FormLabel>Nombre</FormLabel>
                  <Input
                    name="name"
                    value={deptForm.name}
                    onChange={handleDeptChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Descripción</FormLabel>
                  <Input
                    name="description"
                    value={deptForm.description}
                    onChange={handleDeptChange}
                  />
                </FormControl>
                <Button
                  type="submit"
                  colorScheme="green"
                  alignSelf="flex-start"
                  isLoading={createDeptMutation.isPending}
                >
                  Crear departamento
                </Button>
              </VStack>

              {isLoadingDepartments && <Text>Cargando departamentos…</Text>}
              {isErrorDepartments && (
                <Text color="red.400">
                  No se han podido cargar los departamentos (revisa permisos).
                </Text>
              )}
              {!isLoadingDepartments && departments && (
                <Box
                  borderWidth="1px"
                  borderRadius="xl"
                  bg={cardBg}
                  overflow="hidden"
                >
                  <Table size="sm">
                    <Thead bg={tableHeadBg}>
                      <Tr>
                        <Th>Nombre</Th>
                        <Th>Descripción</Th>
                        <Th>Estado</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {departments.length === 0 ? (
                        <Tr>
                          <Td colSpan={3}>
                            <Text fontSize="sm" color="gray.500">
                              Aún no hay departamentos creados.
                            </Text>
                          </Td>
                        </Tr>
                      ) : (
                        departments.map((d) => (
                          <Tr key={d.id}>
                            <Td>{d.name}</Td>
                            <Td>{d.description || "-"}</Td>
                            <Td>
                              <Badge
                                colorScheme={d.is_active ? "green" : "red"}
                              >
                                {d.is_active ? "Activo" : "Inactivo"}
                              </Badge>
                            </Td>
                          </Tr>
                        ))
                      )}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </Box>

            <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
              <Heading as="h2" size="md" mb={4}>
                Empleados
              </Heading>

              <VStack
                as="form"
                align="stretch"
                spacing={3}
                mb={4}
                onSubmit={handleCreateEmployee}
              >
                <FormControl>
                  <FormLabel>Usuario (opcional)</FormLabel>
                  {isLoadingTenantUsers && <Text>Cargando usuarios…</Text>}
                  {tenantUsers && (
                    <Select
                      name="userId"
                      value={
                        employeeForm.userId === "" ? "" : employeeForm.userId
                      }
                      onChange={handleEmployeeChange}
                      placeholder="Sin usuario asociado"
                    >
                      {availableTenantUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email || "sin correo"}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormControl>
                <FormControl isRequired={!employeeForm.userId}>
                  <FormLabel>Nombre completo</FormLabel>
                  <Input
                    name="fullName"
                    value={employeeForm.fullName}
                    onChange={handleEmployeeChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Puesto</FormLabel>
                  <Input
                    name="position"
                    value={employeeForm.position}
                    onChange={handleEmployeeChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Coste por hora</FormLabel>
                  <Input
                    name="hourlyRate"
                    value={employeeForm.hourlyRate}
                    onChange={handleEmployeeChange}
                    placeholder="Ej: 35.5"
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Departamento principal</FormLabel>
                  <Select
                    name="primaryDepartmentId"
                    value={
                      employeeForm.primaryDepartmentId === ""
                        ? ""
                        : employeeForm.primaryDepartmentId
                    }
                    onChange={handleEmployeeChange}
                    placeholder="Selecciona departamento"
                  >
                    {(departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  type="submit"
                  colorScheme="green"
                  alignSelf="flex-start"
                  isLoading={createEmployeeMutation.isPending}
                  isDisabled={
                    !departments ||
                    departments.length === 0 ||
                    (isSuperAdmin && !effectiveTenantId)
                  }
                >
                  Crear empleado
                </Button>
              </VStack>

              {isLoadingEmployees && <Text>Cargando empleados…</Text>}
              {isErrorEmployees && (
                <Text color="red.400">
                  No se han podido cargar los empleados (revisa permisos).
                </Text>
              )}
              {!isLoadingEmployees && employees && (
                <Box
                  borderWidth="1px"
                  borderRadius="xl"
                  bg={cardBg}
                  overflow="hidden"
                >
                  <Box overflowX="auto" pb={2}>
                    <Table size="sm" minWidth="860px">
                      <Thead bg={tableHeadBg}>
                        <Tr>
                          <Th>Empleado</Th>
                          <Th>Correo</Th>
                          <Th isNumeric>Coste/hora</Th>
                          <Th>Puesto</Th>
                          <Th>Departamento</Th>
                          <Th>Estado</Th>
                          <Th minW="96px" whiteSpace="nowrap">
                            Acciones
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                      {employees.length === 0 ? (
                        <Tr>
                          <Td colSpan={7}>
                            <Text fontSize="sm" color="gray.500">
                              Aún no hay empleados registrados.
                            </Text>
                          </Td>
                        </Tr>
                      ) : (
                        employees.map((e) => (
                          <Tr key={e.id}>
                            <Td>
                              {e.full_name ||
                                tenantUsers?.find((u) => u.id === e.user_id)
                                  ?.full_name ||
                                tenantUsers?.find((u) => u.id === e.user_id)
                                  ?.email ||
                                "Sin nombre"}
                            </Td>
                            <Td>{e.email || "-"}</Td>
                            <Td isNumeric>
                              {e.hourly_rate != null
                                ? Number(e.hourly_rate).toFixed(2)
                                : "-"}
                            </Td>
                            <Td>{e.position || "-"}</Td>
                            <Td>
                              {e.primary_department_id
                                ? departmentById.get(e.primary_department_id)
                                    ?.name ?? "-"
                                : "-"}
                            </Td>
                            <Td>
                              <Badge
                                colorScheme={e.is_active ? "green" : "red"}
                              >
                                {e.is_active ? "Activo" : "Inactivo"}
                              </Badge>
                            </Td>
                            <Td minW="96px" whiteSpace="nowrap">
                              <Button
                                size="xs"
                                onClick={() => openEditEmployee(e)}
                              >
                                Editar
                              </Button>
                            </Td>
                          </Tr>
                        ))
                      )}
                      </Tbody>
                    </Table>
                  </Box>
                </Box>
              )}
            </Box>
          </SimpleGrid>

          <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
            <Heading as="h2" size="md" mb={4}>
              Headcount por departamento
            </Heading>
            {isLoadingHeadcount && <Text>Cargando informe…</Text>}
            {!isLoadingHeadcount && headcount && (
              <>
                <Box overflowX="auto" bg={cardBg} borderRadius="xl" mb={4}>
                  <Table size="sm" minWidth="420px">
                  <Thead bg={tableHeadBg}>
                    <Tr>
                      <Th>Departamento</Th>
                      <Th isNumeric>Empleados activos</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {headcount.length === 0 ? (
                      <Tr>
                        <Td colSpan={2}>
                          <Text fontSize="sm" color="gray.500">
                            Aún no hay datos de headcount para este tenant.
                          </Text>
                        </Td>
                      </Tr>
                    ) : (
                      headcount.map((item) => (
                        <Tr key={item.department_id ?? Math.random()}>
                          <Td>{item.department_name ?? "-"}</Td>
                          <Td isNumeric>{item.total_employees}</Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
                </Box>
                <Text fontWeight="semibold" color={subtleText}>
                  Total empleados activos: {totalEmployees}
                </Text>
              </>
            )}
          </Box>
        </>
      )}

      <Modal isOpen={isOpen} onClose={handleCloseEdit} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Editar empleado</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel>Nombre completo</FormLabel>
                <Input
                  name="fullName"
                  value={employeeEditForm.fullName}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Correo</FormLabel>
                <Input
                  name="email"
                  value={employeeEditForm.email}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Puesto</FormLabel>
                <Input
                  name="position"
                  value={employeeEditForm.position}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Coste por hora</FormLabel>
                <Input
                  name="hourlyRate"
                  value={employeeEditForm.hourlyRate}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Departamento principal</FormLabel>
                <Select
                  name="primaryDepartmentId"
                  value={
                    employeeEditForm.primaryDepartmentId === ""
                      ? ""
                      : employeeEditForm.primaryDepartmentId
                  }
                  onChange={handleEmployeeEditChange}
                  placeholder="Selecciona departamento"
                >
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Estado</FormLabel>
                <Select
                  value={employeeEditForm.isActive ? "active" : "inactive"}
                  onChange={(event) =>
                    setEmployeeEditForm((prev) => ({
                      ...prev,
                      isActive: event.target.value === "active",
                    }))
                  }
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseEdit}>
              Cancelar
            </Button>
            <Button
              colorScheme="red"
              variant="outline"
              mr={3}
              onClick={handleDeleteEmployee}
              isLoading={deleteEmployeeMutation.isPending}
            >
              Eliminar
            </Button>
            <Button
              colorScheme="green"
              onClick={handleUpdateEmployee}
              isLoading={updateEmployeeMutation.isPending}
            >
              Guardar cambios
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AlertDialog
        isOpen={isDeleteOpen}
        leastDestructiveRef={deleteCancelRef}
        onClose={onDeleteClose}
        isCentered
      >
        <AlertDialogOverlay />
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Eliminar empleado
          </AlertDialogHeader>
          <AlertDialogBody>
            Esta accion no se puede deshacer. Quieres continuar?
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={deleteCancelRef} onClick={onDeleteClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="red"
              onClick={confirmDeleteEmployee}
              ml={3}
              isLoading={deleteEmployeeMutation.isPending}
            >
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
};


