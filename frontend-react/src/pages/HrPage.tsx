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
  Divider,
  FormControl,
  FormLabel,
  Flex,
  HStack,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
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
import { PageHero } from "../components/layout/PageHero";
import {
  createDepartment,
  createEmployee,
  deleteEmployee,
  updateEmployee,
  fetchDepartments,
  updateDepartment,
  fetchEmployees,
  fetchEmployeeAllocations,
  fetchHeadcount,
  type Department,
  type DepartmentUpdatePayload,
  type EmployeeAllocation,
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

// Pequeño helper visual para las tarjetas de empleado.
const StatCell: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const border = useColorModeValue("gray.200", "gray.700");
  const bg = useColorModeValue("gray.50", "gray.800");
  const subtle = useColorModeValue("gray.600", "gray.400");
  return (
    <Box borderWidth="1px" borderColor={border} borderRadius="md" p={3} bg={bg}>
      <Text fontSize="xs" color={subtle} mb={1} fontWeight="bold">
        {label}
      </Text>
      <Text fontWeight="semibold">{value}</Text>
    </Box>
  );
};

const TITULACION_OPTIONS = [
  { value: "doctorado", label: "Doctorado" },
  { value: "universitario", label: "Universitario" },
  { value: "no_universitario", label: "No universitario" },
];

interface DepartmentFormState {
  name: string;
  description: string;
  projectAllocationPercentage: string;
}

interface EmployeeFormState {
  userId: number | "";
  fullName: string;
  email: string;
  hourlyRate: string;
  position: string;
  titulacion: string;
  availableHours: string;
  availabilityPercentage: string;
  primaryDepartmentId: number | "";
}

interface EmployeeEditFormState {
  fullName: string;
  email: string;
  hourlyRate: string;
  position: string;
  titulacion: string;
  availableHours: string;
  availabilityPercentage: string;
  primaryDepartmentId: number | "";
  isActive: boolean;
}

// Pantalla de recursos humanos: departamentos y empleados.
interface HrPageProps {
  section?: "all" | "departments" | "employees" | "talent";
}

export const HrPage: React.FC<HrPageProps> = ({ section = "all" }) => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onClose: onCreateClose,
  } = useDisclosure();
  const {
    isOpen: isDeptOpen,
    onOpen: onDeptOpen,
    onClose: onDeptClose,
  } = useDisclosure();
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
  const isSuperAdmin = currentUser?.is_super_admin === true;
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
    projectAllocationPercentage: "100",
  });
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>({
    userId: "",
    fullName: "",
    email: "",
    hourlyRate: "",
    position: "",
    titulacion: "",
    availableHours: "",
    availabilityPercentage: "",
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
      titulacion: "",
      availableHours: "",
      availabilityPercentage: "",
      primaryDepartmentId: "",
      isActive: true,
    });

  const handleCloseDeptModal = () => {
    setEditingDepartment(null);
    setDeptForm({ name: "", description: "", projectAllocationPercentage: "100" });
    onDeptClose();
  };

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

  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const years = [];
    for (let y = now - 3; y <= now + 1; y += 1) {
      years.push(y);
    }
    return years;
  }, []);

  const { data: allocations = [] } = useQuery<EmployeeAllocation[]>({
    queryKey: ["hr-allocations", effectiveTenantId, selectedYear],
    queryFn: () =>
      fetchEmployeeAllocations({
        tenantId: effectiveTenantId ?? undefined,
      }),
    enabled: effectiveTenantId != null || !isSuperAdmin,
    refetchOnWindowFocus: false,
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

  const allocationsByEmployee = useMemo(() => {
    const map = new Map<number, number>();
    allocations.forEach((alloc) => {
      if (!alloc.employee_id) return;
      if (alloc.year != null && alloc.year !== selectedYear) return;
      const hours = Number(alloc.allocated_hours ?? 0);
      map.set(alloc.employee_id, (map.get(alloc.employee_id) ?? 0) + hours);
    });
    return map;
  }, [allocations, selectedYear]);

  const createDeptMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-departments"] });
      handleCloseDeptModal();
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
      handleCloseDeptModal();
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
    onSuccess: (createdEmployee, variables) => {
      // Mezcla valores introducidos en el formulario en caso de que la API no devuelva los nuevos campos.
      const merged = {
        ...createdEmployee,
        available_hours:
          createdEmployee.available_hours ??
          variables.data.available_hours ??
          null,
        availability_percentage:
          createdEmployee.availability_percentage ??
          variables.data.availability_percentage ??
          null,
      };
      queryClient.setQueryData<EmployeeProfile[] | undefined>(
        ["hr-employees", effectiveTenantId],
        (prev) => (prev ? [...prev, merged] : [merged])
      );
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
      setEmployeeForm({
        userId: "",
        fullName: "",
        email: "",
        hourlyRate: "",
        position: "",
        titulacion: "",
        availableHours: "",
        availabilityPercentage: "",
        primaryDepartmentId: "",
        isActive: true,
      });
      handleCloseCreate();
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
    onSuccess: (updatedEmployee, variables) => {
      // Mezcla valores enviados para garantizar que los campos de disponibilidad se reflejen en UI.
      const mergedFields = {
        available_hours:
          updatedEmployee.available_hours ??
          variables.data.available_hours ??
          null,
        availability_percentage:
          updatedEmployee.availability_percentage ??
          variables.data.availability_percentage ??
          null,
      };
      queryClient.setQueryData<EmployeeProfile[] | undefined>(
        ["hr-employees", effectiveTenantId],
        (prev) =>
          prev?.map((emp) =>
            emp.id === updatedEmployee.id ? { ...emp, ...updatedEmployee, ...mergedFields } : emp
          ) ?? prev
      );
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
      titulacion: employee.titulacion ?? "",
      availableHours:
        employee.available_hours != null ? String(employee.available_hours) : "",
      availabilityPercentage:
        employee.availability_percentage != null
          ? String(employee.availability_percentage)
          : "",
      primaryDepartmentId: employee.primary_department_id ?? "",
      isActive: employee.is_active,
    });
    onOpen();
  };

  const handleCloseEdit = () => {
    setEditingEmployee(null);
    onClose();
  };

  const handleCloseCreate = () => {
    setEmployeeForm({
      userId: "",
      fullName: "",
      email: "",
      hourlyRate: "",
      position: "",
      titulacion: "",
      availableHours: "",
      availabilityPercentage: "",
      primaryDepartmentId: "",
      isActive: true,
    });
    onCreateClose();
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
        titulacion: employeeEditForm.titulacion || undefined,
        available_hours:
          employeeEditForm.availableHours.trim() === ""
            ? null
            : Number(employeeEditForm.availableHours),
        availability_percentage:
          employeeEditForm.availabilityPercentage.trim() === ""
            ? null
            : Number(employeeEditForm.availabilityPercentage),
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
          project_allocation_percentage:
            deptForm.projectAllocationPercentage.trim() === ""
              ? null
              : Number(deptForm.projectAllocationPercentage),
        },
      });
    } else {
      createDeptMutation.mutate({
        data: {
          name: deptForm.name.trim(),
          description: deptForm.description || undefined,
          is_active: true,
          project_allocation_percentage:
            deptForm.projectAllocationPercentage.trim() === ""
              ? null
              : Number(deptForm.projectAllocationPercentage),
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
      projectAllocationPercentage:
        dept.project_allocation_percentage != null
          ? String(dept.project_allocation_percentage)
          : "100",
    });
    onDeptOpen();
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
        titulacion: employeeForm.titulacion || undefined,
        employment_type: "permanent",
        available_hours:
          employeeForm.availableHours.trim() === ""
            ? null
            : Number(employeeForm.availableHours),
        availability_percentage:
          employeeForm.availabilityPercentage.trim() === ""
            ? null
            : Number(employeeForm.availabilityPercentage),
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

  // Filtro por departamento para la vista de empleados.
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<
    number | "all"
  >("all");
  const departmentOptions = useMemo(
    () => departments ?? [],
    [departments]
  );

  // Empleados filtrados según el departamento seleccionado.
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    const activeByYear = employees.filter((emp) => {
      const hire = emp.hire_date ? new Date(emp.hire_date) : null;
      const end = emp.end_date ? new Date(emp.end_date) : null;
      if (hire && Number.isNaN(hire.getTime())) return true;
      if (end && Number.isNaN(end.getTime())) return true;
      const started = !hire || hire <= yearEnd;
      const notEnded = !end || end >= yearStart;
      return started && notEnded;
    });
    if (selectedDepartmentFilter === "all") return activeByYear;
    return activeByYear.filter(
      (e) => e.primary_department_id === selectedDepartmentFilter
    );
  }, [employees, selectedDepartmentFilter, selectedYear]);

  // Render principal de la pagina.
  const showDepartments = section === "all" || section === "departments";
  const showEmployees = section === "all" || section === "employees" || section === "talent";
  const employeesHeading =
    section === "talent" ? t("hr.talent.title") : t("hr.employees.title");

  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("hr.header.eyebrow")}
          title={t("hr.header.title")}
          subtitle={t("hr.header.subtitle")}
        />
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
          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6} mb={8}>
            {showDepartments && (
              <Box
                id="departments"
                gridColumn={{ base: "1 / -1", xl: "1 / span 2" }}
                borderWidth="1px"
                borderRadius="xl"
                p={6}
                bg={panelBg}
              >
                <Flex justify="space-between" align="center" mb={4} gap={3}>
                  <Heading as="h2" size="md">
                    {t("hr.departments.title")}
                  </Heading>
                  <Button
                    size="sm"
                    colorScheme="green"
                    onClick={() => {
                      setEditingDepartment(null);
                      setDeptForm({
                        name: "",
                        description: "",
                        projectAllocationPercentage: "100",
                      });
                      onDeptOpen();
                    }}
                  >
                    {t("hr.departments.form.create")}
                  </Button>
                </Flex>

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
                  overflowX="auto"
                >
                  <Table size="sm" minW="680px">
                    <Thead bg={tableHeadBg}>
                      <Tr>
                        <Th>{t("hr.departments.table.name")}</Th>
                        <Th>{t("hr.departments.table.description")}</Th>
                        <Th>{t("hr.departments.table.allocation")}</Th>
                        <Th>{t("hr.departments.table.status")}</Th>
                        <Th>{t("hr.departments.table.actions")}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {departments.length === 0 ? (
                        <Tr>
                          <Td colSpan={4}>
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
                              {d.project_allocation_percentage != null
                                ? `${Number(d.project_allocation_percentage).toFixed(0)}%`
                                : "100%"}
                            </Td>
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
                                {t("hr.departments.table.edit")}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                colorScheme="red"
                                onClick={() => handleDeleteDepartment(d)}
                                isLoading={updateDeptMutation.isPending}
                              >
                                {t("hr.departments.table.delete")}
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
            )}

            {showEmployees && (
              <Box
                id={section === "talent" ? "talent" : "employees"}
                gridColumn={{ base: "1 / -1", xl: showDepartments ? "2 / span 2" : "1 / -1" }}
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={panelBg}
              >
              <HStack justify="space-between" mb={2} flexWrap="wrap">
                <Heading as="h2" size="sm">
                  {employeesHeading}
                </Heading>
                <Button
                  colorScheme="green"
                  size="xs"
                  onClick={onCreateOpen}
                >
                  {t("hr.employees.form.create")}
                </Button>
              </HStack>

              <Divider my={1} />
              <Heading as="h3" size="xs" mb={2}>
                {t("hr.employees.table.employee")}
              </Heading>

              {isLoadingEmployees && <Text>{t("hr.employees.loading")}</Text>}
              {isErrorEmployees && (
                <Text color="red.400">
                  {t("hr.employees.error")}
                </Text>
              )}
              </Box>
            )}
          </SimpleGrid>

          {/* Listado de empleados con filtro de departamentos */}
          {!isLoadingEmployees && employees && (
            <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
              <SimpleGrid columns={{ base: 1, lg: 4 }} spacing={4} alignItems="flex-start">
                <Box
                  gridColumn={{ base: "1 / -1", lg: "1 / span 1" }}
                  borderWidth="1px"
                  borderRadius="xl"
                  p={4}
                  bg={cardBg}
                >
                  <Heading size="sm" mb={3}>
                    {t("hr.departments.title")}
                  </Heading>
                  <VStack align="stretch" spacing={2}>
                    <FormControl>
                      <FormLabel fontSize="xs" mb={1}>
                        Año
                      </FormLabel>
                      <Select
                        size="sm"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                      >
                        {yearOptions.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      size="sm"
                      variant={selectedDepartmentFilter === "all" ? "solid" : "ghost"}
                      colorScheme="green"
                      justifyContent="space-between"
                      onClick={() => setSelectedDepartmentFilter("all")}
                    >
                      <Text>Todos los departamentos</Text>
                      <Badge>{employees.length}</Badge>
                    </Button>
                    {departmentOptions.map((dept) => {
                      const count = employees.filter(
                        (emp) => emp.primary_department_id === dept.id
                      ).length;
                      return (
                        <Button
                          key={dept.id}
                          size="sm"
                          variant={selectedDepartmentFilter === dept.id ? "solid" : "ghost"}
                          justifyContent="space-between"
                          onClick={() => setSelectedDepartmentFilter(dept.id)}
                        >
                          <Text>{dept.name}</Text>
                          <Badge>{count}</Badge>
                        </Button>
                      );
                    })}
                  </VStack>
                </Box>

                <VStack
                  gridColumn={{ base: "1 / -1", lg: "2 / span 3" }}
                  align="stretch"
                  spacing={3}
                >
                  {filteredEmployees.length === 0 ? (
                    <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
                      <Text fontSize="sm" color="gray.500">
                        {t("hr.employees.table.empty")}
                      </Text>
                    </Box>
      ) : (
                    filteredEmployees.map((e) => {
                      const fullName =
                        e.full_name ||
                        tenantUsers?.find((u) => u.id === e.user_id)?.full_name ||
                        tenantUsers?.find((u) => u.id === e.user_id)?.email ||
                        t("hr.employees.table.noName");
                      const departmentName = e.primary_department_id
                        ? departmentById.get(e.primary_department_id)?.name ?? "-"
                        : "-";
                      const availabilityPct =
                        e.availability_percentage != null
                          ? Number(e.availability_percentage)
                          : null;
                      const availabilityHours =
                        e.available_hours != null ? Number(e.available_hours) : null;
                      const baseCapacityHours =
                        availabilityHours != null && availabilityPct != null
                          ? Math.max(0, availabilityHours * (availabilityPct / 100))
                          : availabilityHours != null
                            ? Math.max(0, availabilityHours)
                            : null;
                      const usedHours = allocationsByEmployee.get(e.id) ?? 0;
                      const remainingHours =
                        baseCapacityHours != null ? baseCapacityHours - usedHours : null;
                      const remainingPct =
                        baseCapacityHours && baseCapacityHours > 0
                          ? Math.max(0, (remainingHours ?? 0) / baseCapacityHours * 100)
                          : null;

                      return (
                        <Box
                          key={e.id}
                          borderWidth="1px"
                          borderRadius="xl"
                          p={5}
                          bg={cardBg}
                          boxShadow="sm"
                        >
                          <Flex
                            justify="space-between"
                            align={{ base: "flex-start", md: "center" }}
                            gap={3}
                            wrap="wrap"
                            mb={3}
                          >
                            <Box>
                              <Heading size="sm">{fullName}</Heading>
                              <Text fontSize="sm" color={subtleText}>
                                {e.position || "-"} • {departmentName}
                              </Text>
                              <Text fontSize="xs" color={subtleText}>
                                {e.email || "-"}
                              </Text>
                            </Box>
                            <HStack spacing={3}>
                              <Badge colorScheme={e.is_active ? "green" : "red"}>
                                {e.is_active ? t("hr.status.active") : t("hr.status.inactive")}
                              </Badge>
                              <Badge colorScheme="blue">
                                {e.hourly_rate != null
                                  ? `€${Number(e.hourly_rate).toFixed(2)}/h`
                                  : t("hr.employees.table.hourlyRate")}
                              </Badge>
                              <Button size="sm" onClick={() => openEditEmployee(e)}>
                                {t("hr.employees.table.edit")}
                              </Button>
                            </HStack>
                          </Flex>

                          <SimpleGrid columns={{ base: 1, md: 3, lg: 6 }} spacing={3}>
                            <StatCell
                              label={t("hr.employees.table.department", "Departamento")}
                              value={departmentName}
                            />
                            <StatCell
                              label={t("hr.employees.table.position", "Puesto")}
                              value={e.position || "-"}
                            />
                            <StatCell
                              label={t("hr.employees.table.hourlyRate", "Coste/hora")}
                              value={
                                e.hourly_rate != null
                                  ? `€${Number(e.hourly_rate).toFixed(2)}`
                                  : "-"
                              }
                            />
                              <StatCell
                                label={t("hr.employees.table.availableHours", "Horas disponibles")}
                                value={
                                  remainingHours != null
                                    ? `${remainingHours.toFixed(2)}h`
                                    : availabilityHours != null
                                      ? `${availabilityHours.toFixed(2)}h`
                                      : "-"
                                }
                              />
                              <StatCell
                                label={t("hr.employees.table.availabilityPercentage", "Disponibilidad %")}
                                value={
                                  remainingPct != null
                                    ? `${remainingPct.toFixed(1)}%`
                                    : availabilityPct != null
                                      ? `${availabilityPct.toFixed(1)}%`
                                      : "-"
                                }
                              />
                            <StatCell label={t("hr.employees.table.email", "Correo")} value={e.email || "-"} />
                          </SimpleGrid>

                          {remainingPct != null && (
                            <Box mt={4}>
                              <Progress
                                value={Math.min(100, Math.max(0, remainingPct))}
                                size="sm"
                                borderRadius="full"
                                colorScheme={
                                  remainingPct >= 70
                                    ? "green"
                                    : remainingPct >= 40
                                      ? "yellow"
                                      : remainingPct >= 15
                                        ? "orange"
                                        : "red"
                                }
                              />
                            </Box>
                          )}
                        </Box>
                      );
                    })
                  )}
                </VStack>
              </SimpleGrid>
            </Box>
          )}

          {/* Headcount eliminado según solicitud */}
        </>
      )}

      <Modal isOpen={isDeptOpen} onClose={handleCloseDeptModal} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editingDepartment
              ? t("hr.departments.form.editTitle")
              : t("hr.departments.form.createTitle")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack
              as="form"
              id="department-form"
              align="stretch"
              spacing={3}
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
              <FormControl>
                <FormLabel>{t("hr.departments.form.allocation")}</FormLabel>
                <Input
                  name="projectAllocationPercentage"
                  type="number"
                  min={0}
                  max={100}
                  value={deptForm.projectAllocationPercentage}
                  onChange={handleDeptChange}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseDeptModal}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="department-form"
              colorScheme="green"
              isLoading={createDeptMutation.isPending || updateDeptMutation.isPending}
            >
              {editingDepartment
                ? t("hr.departments.form.save")
                : t("hr.departments.form.create")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

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
                <FormLabel>{t("hr.modal.titulacion")}</FormLabel>
                <Select
                  name="titulacion"
                  value={employeeEditForm.titulacion}
                  onChange={handleEmployeeEditChange}
                  placeholder={t("hr.employees.form.titulacionPlaceholder")}
                >
                  {TITULACION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.hourlyRate")}</FormLabel>
                <Input
                  name="hourlyRate"
                  type="number"
                  value={employeeEditForm.hourlyRate}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.availableHours", "Horas disponibles")}</FormLabel>
                <Input
                  name="availableHours"
                  type="number"
                  value={employeeEditForm.availableHours}
                  onChange={handleEmployeeEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.modal.availabilityPercentage", "Disponibilidad %")}</FormLabel>
                <Input
                  name="availabilityPercentage"
                  type="number"
                  value={employeeEditForm.availabilityPercentage}
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

      <Modal isOpen={isCreateOpen} onClose={handleCloseCreate} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("hr.employees.form.create")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack
              as="form"
              align="stretch"
              spacing={3}
              onSubmit={handleCreateEmployee}
            >
              <FormControl>
                <FormLabel>{t("hr.employees.form.userOptional")}</FormLabel>
                {isLoadingTenantUsers && (
                  <Text>{t("hr.employees.form.loadingUsers")}</Text>
                )}
                {tenantUsers && (
                  <Select
                    name="userId"
                    value={employeeForm.userId === "" ? "" : employeeForm.userId}
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
                <FormLabel>{t("hr.employees.form.titulacion")}</FormLabel>
                <Select
                  name="titulacion"
                  value={employeeForm.titulacion}
                  onChange={handleEmployeeChange}
                  placeholder={t("hr.employees.form.titulacionPlaceholder")}
                >
                  {TITULACION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.employees.form.hourlyRate")}</FormLabel>
                <Input
                  name="hourlyRate"
                  type="number"
                  value={employeeForm.hourlyRate}
                  onChange={handleEmployeeChange}
                  placeholder={t("hr.employees.form.hourlyRatePlaceholder")}
                />
              </FormControl>
              <FormControl>
                <FormLabel>
                  {t("hr.employees.form.availableHours", "Horas disponibles")}
                </FormLabel>
                <Input
                  name="availableHours"
                  type="number"
                  value={employeeForm.availableHours}
                  onChange={handleEmployeeChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>
                  {t(
                    "hr.employees.form.availabilityPercentage",
                    "Disponibilidad %",
                  )}
                </FormLabel>
                <Input
                  name="availabilityPercentage"
                  type="number"
                  value={employeeForm.availabilityPercentage}
                  onChange={handleEmployeeChange}
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
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseCreate}>
              {t("common.cancel")}
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


