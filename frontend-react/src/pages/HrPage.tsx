import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import {
  createDepartment,
  createEmployee,
  deleteEmployee,
  updateEmployee,
  fetchDepartments,
  updateDepartment,
  fetchEmployees,
  fetchHeadcount,
  type Department,
  type DepartmentUpdatePayload,
  type EmployeeProfile,
  type HeadcountItem,
} from "../api/hr";
import {
  fetchAllTenants,
  fetchUsersByTenant,
  type TenantOption,
  type TenantUserSummary,
} from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";

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
  const { t } = useTranslation();
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

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const currentTenantId = currentUser?.tenant_id ?? null;

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (!currentTenantId) return;
    if (selectedTenantId !== null) return;
    setSelectedTenantId(currentTenantId);
  }, [currentTenantId, isSuperAdmin, selectedTenantId]);

  const [deptForm, setDeptForm] = useState<DepartmentFormState>({
    name: "",
    description: "",
  });
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

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
      setEditingDepartment(null);
      toast({
        title: t("hr.messages.departmentCreated"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: t("hr.messages.departmentCreateErrorTitle"),
        description: t("hr.messages.genericErrorDesc"),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  const updateDeptMutation = useMutation({
    mutationFn: (payload: DepartmentUpdatePayload) => updateDepartment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-departments"] });
      setDeptForm({ name: "", description: "" });
      setEditingDepartment(null);
      toast({
        title: t("hr.messages.departmentUpdated") || "Departamento actualizado",
        status: "success",
      });
    },
    onError: () => {
      toast({
        title: t("hr.messages.departmentUpdateError") || "Error al actualizar departamento",
        status: "error",
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
        title: t("hr.messages.employeeCreated"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: t("hr.messages.employeeCreateErrorTitle"),
        description: t("hr.messages.employeeCreateErrorDesc"),
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
        title: t("hr.messages.employeeUpdated"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      handleCloseEdit();
    },
    onError: () => {
      toast({
        title: t("hr.messages.employeeUpdateErrorTitle"),
        description: t("hr.messages.genericErrorDesc"),
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
        title: t("hr.messages.employeeDeleted"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      handleCloseEdit();
    },
    onError: () => {
      toast({
        title: t("hr.messages.employeeDeleteErrorTitle"),
        description: t("hr.messages.genericErrorDesc"),
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
        title: t("hr.messages.departmentRequired"),
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

  const handleSubmitDepartment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!deptForm.name.trim()) {
      toast({
        title: t("hr.messages.nameRequired"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (!editingDepartment && isSuperAdmin && !effectiveTenantId) {
      toast({
        title: t("hr.messages.selectTenant"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (editingDepartment) {
      updateDeptMutation.mutate({
        departmentId: editingDepartment.id,
        data: {
          name: deptForm.name.trim(),
          description: deptForm.description || undefined,
        },
      });
    } else {
      createDeptMutation.mutate({
        data: {
          name: deptForm.name.trim(),
          description: deptForm.description || undefined,
          is_active: true,
        },
        tenantId: isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
      });
    }
  };

  const startEditDepartment = (dept: Department) => {
    setEditingDepartment(dept);
    setDeptForm({
      name: dept.name ?? "",
      description: dept.description ?? "",
    });
  };

  const handleDeleteDepartment = (dept: Department) => {
    updateDeptMutation.mutate({
      departmentId: dept.id,
      data: { is_active: false },
    });
  };

  const handleCreateEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeForm.primaryDepartmentId) {
      toast({
        title: t("hr.messages.departmentRequired"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (!employeeForm.userId && !employeeForm.fullName.trim()) {
      toast({
        title: t("hr.messages.nameRequired"),
        description: t("hr.messages.employeeNameRequiredDesc"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (isSuperAdmin && !effectiveTenantId) {
      toast({
        title: t("hr.messages.selectTenant"),
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
            {t("hr.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("hr.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("hr.header.subtitle")}
          </Text>
        </VStack>
      </Box>

      {isSuperAdmin && (
        <Box mb={6}>
          <FormControl maxW="320px">
            <FormLabel>{t("hr.tenant.label")}</FormLabel>
            {isLoadingTenants && <Text>{t("hr.tenant.loading")}</Text>}
            {isErrorTenants && (
              <Text color="red.400">{t("hr.tenant.loadError")}</Text>
            )}
            {tenants && (
              <Select
                value={selectedTenantId ?? ""}
                onChange={(e) =>
                  setSelectedTenantId(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder={t("hr.tenant.placeholder")}
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
          {t("hr.emptyTenant")}
        </Text>
      )}

      {effectiveTenantId && (
        <>
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={8}>
            <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
              <Heading as="h2" size="md" mb={4}>
                {t("hr.departments.title")}
              </Heading>

              <VStack
                as="form"
                align="stretch"
                spacing={3}
                mb={4}
                onSubmit={handleSubmitDepartment}
              >
                <FormControl isRequired>
                  <FormLabel>{t("hr.departments.form.name")}</FormLabel>
                  <Input
                    name="name"
                    value={deptForm.name}
                    onChange={handleDeptChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("hr.departments.form.description")}</FormLabel>
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
                  isLoading={createDeptMutation.isPending || updateDeptMutation.isPending}
                >
                  {editingDepartment
                    ? t("hr.departments.form.update") || "Actualizar"
                    : t("hr.departments.form.create")}
                </Button>
                {editingDepartment && (
                  <Button
                    type="button"
                    variant="ghost"
                    alignSelf="flex-start"
                    onClick={() => {
                      setEditingDepartment(null);
                      setDeptForm({ name: "", description: "" });
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                )}
              </VStack>

              {isLoadingDepartments && <Text>{t("hr.departments.loading")}</Text>}
              {isErrorDepartments && (
                <Text color="red.400">
                  {t("hr.departments.error")}
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
                        <Th>{t("hr.departments.table.name")}</Th>
                        <Th>{t("hr.departments.table.description")}</Th>
                        <Th>{t("hr.departments.table.status")}</Th>
                        <Th>{t("common.actions")}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {departments.length === 0 ? (
                        <Tr>
                          <Td colSpan={3}>
                            <Text fontSize="sm" color="gray.500">
                              {t("hr.departments.table.empty")}
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
                                {d.is_active ? t("hr.status.active") : t("hr.status.inactive")}
                              </Badge>
                            </Td>
                            <Td>
                              <Button
                                size="xs"
                                variant="ghost"
                                colorScheme="blue"
                                mr={2}
                                onClick={() => startEditDepartment(d)}
                              >
                                {t("common.edit") || "Editar"}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                colorScheme="red"
                                onClick={() => handleDeleteDepartment(d)}
                                isLoading={updateDeptMutation.isPending}
                              >
                                {t("common.delete") || "Eliminar"}
                              </Button>
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
                {t("hr.employees.title")}
              </Heading>

              <VStack
                as="form"
                align="stretch"
                spacing={3}
                mb={4}
                onSubmit={handleCreateEmployee}
              >
                <FormControl>
                  <FormLabel>{t("hr.employees.form.userOptional")}</FormLabel>
                  {isLoadingTenantUsers && <Text>{t("hr.employees.form.loadingUsers")}</Text>}
                  {tenantUsers && (
                    <Select
                      name="userId"
                      value={
                        employeeForm.userId === "" ? "" : employeeForm.userId
                      }
                      onChange={handleEmployeeChange}
                      placeholder={t("hr.employees.form.userPlaceholder")}
                    >
                      {availableTenantUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email || t("hr.employees.form.noEmail")}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormControl>
                <FormControl isRequired={!employeeForm.userId}>
                  <FormLabel>{t("hr.employees.form.fullName")}</FormLabel>
                  <Input
                    name="fullName"
                    value={employeeForm.fullName}
                    onChange={handleEmployeeChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("hr.employees.form.position")}</FormLabel>
                  <Input
                    name="position"
                    value={employeeForm.position}
                    onChange={handleEmployeeChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("hr.employees.form.hourlyRate")}</FormLabel>
                  <Input
                    name="hourlyRate"
                    value={employeeForm.hourlyRate}
                    onChange={handleEmployeeChange}
                    placeholder={t("hr.employees.form.hourlyRatePlaceholder")}
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{t("hr.employees.form.primaryDepartment")}</FormLabel>
                  <Select
                    name="primaryDepartmentId"
                    value={
                      employeeForm.primaryDepartmentId === ""
                        ? ""
                        : employeeForm.primaryDepartmentId
                    }
                    onChange={handleEmployeeChange}
                    placeholder={t("hr.employees.form.departmentPlaceholder")}
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
                  {t("hr.employees.form.create")}
                </Button>
              </VStack>

              {isLoadingEmployees && <Text>{t("hr.employees.loading")}</Text>}
              {isErrorEmployees && (
                <Text color="red.400">
                  {t("hr.employees.error")}
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
                          <Th>{t("hr.employees.table.employee")}</Th>
                          <Th>{t("hr.employees.table.email")}</Th>
                          <Th isNumeric>{t("hr.employees.table.hourlyRate")}</Th>
                          <Th>{t("hr.employees.table.position")}</Th>
                          <Th>{t("hr.employees.table.department")}</Th>
                          <Th>{t("hr.employees.table.status")}</Th>
                          <Th minW="96px" whiteSpace="nowrap">
                            {t("hr.employees.table.actions")}
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                      {employees.length === 0 ? (
                        <Tr>
                          <Td colSpan={7}>
                            <Text fontSize="sm" color="gray.500">
                              {t("hr.employees.table.empty")}
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
                                t("hr.employees.table.noName")}
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
                                {e.is_active ? t("hr.status.active") : t("hr.status.inactive")}
                              </Badge>
                            </Td>
                            <Td minW="96px" whiteSpace="nowrap">
                              <Button
                                size="xs"
                                onClick={() => openEditEmployee(e)}
                              >
                                {t("hr.employees.table.edit")}
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
              {t("hr.headcount.title")}
            </Heading>
            {isLoadingHeadcount && <Text>{t("hr.headcount.loading")}</Text>}
            {!isLoadingHeadcount && headcount && (
              <>
                <Box overflowX="auto" bg={cardBg} borderRadius="xl" mb={4}>
                  <Table size="sm" minWidth="420px">
                  <Thead bg={tableHeadBg}>
                    <Tr>
                      <Th>{t("hr.headcount.table.department")}</Th>
                      <Th isNumeric>{t("hr.headcount.table.activeEmployees")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {headcount.length === 0 ? (
                      <Tr>
                        <Td colSpan={2}>
                          <Text fontSize="sm" color="gray.500">
                            {t("hr.headcount.table.empty")}
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
                  {t("hr.headcount.totalActive", { total: totalEmployees })}
                </Text>
              </>
            )}
          </Box>
        </>
      )}

      <Modal isOpen={isOpen} onClose={handleCloseEdit} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("hr.modal.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel>{t("hr.modal.fullName")}</FormLabel>
                <Input
                  name="fullName"
                  value={employeeEditForm.fullName}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.email")}</FormLabel>
                <Input
                  name="email"
                  value={employeeEditForm.email}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.position")}</FormLabel>
                <Input
                  name="position"
                  value={employeeEditForm.position}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.hourlyRate")}</FormLabel>
                <Input
                  name="hourlyRate"
                  value={employeeEditForm.hourlyRate}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("hr.modal.primaryDepartment")}</FormLabel>
                <Select
                  name="primaryDepartmentId"
                  value={
                    employeeEditForm.primaryDepartmentId === ""
                      ? ""
                      : employeeEditForm.primaryDepartmentId
                  }
                  onChange={handleEmployeeEditChange}
                  placeholder={t("hr.modal.departmentPlaceholder")}
                >
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.status")}</FormLabel>
                <Select
                  value={employeeEditForm.isActive ? "active" : "inactive"}
                  onChange={(event) =>
                    setEmployeeEditForm((prev) => ({
                      ...prev,
                      isActive: event.target.value === "active",
                    }))
                  }
                >
                  <option value="active">{t("hr.modal.statusActive")}</option>
                  <option value="inactive">{t("hr.modal.statusInactive")}</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseEdit}>
              {t("hr.modal.cancel")}
            </Button>
            <Button
              colorScheme="red"
              variant="outline"
              mr={3}
              onClick={handleDeleteEmployee}
              isLoading={deleteEmployeeMutation.isPending}
            >
              {t("hr.modal.delete")}
            </Button>
            <Button
              colorScheme="green"
              onClick={handleUpdateEmployee}
              isLoading={updateEmployeeMutation.isPending}
            >
              {t("hr.modal.save")}
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
            {t("hr.alert.title")}
          </AlertDialogHeader>
          <AlertDialogBody>
            {t("hr.alert.body")}
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={deleteCancelRef} onClick={onDeleteClose}>
              {t("hr.alert.cancel")}
            </Button>
            <Button
              colorScheme="red"
              onClick={confirmDeleteEmployee}
              ml={3}
              isLoading={deleteEmployeeMutation.isPending}
            >
              {t("hr.alert.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
};


