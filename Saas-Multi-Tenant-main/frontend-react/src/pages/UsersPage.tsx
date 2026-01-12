import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  HStack,
  useToast,
  useColorModeValue,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";
import type { CurrentUser } from "../api/users";
import { createUserInvitation } from "../api/users";

interface TenantOption {
  id: number;
  name: string;
  subdomain: string;
}

interface User {
  id: number;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  tenant_id?: number | null;
  role_id?: number | null;
}

async function fetchTenants(): Promise<TenantOption[]> {
  const response = await apiClient.get<TenantOption[]>("/api/v1/tenants/");
  return response.data;
}

async function fetchUsers(tenantId: number): Promise<User[]> {
  const response = await apiClient.get<User[]>(
    `/api/v1/users/by-tenant/${tenantId}`,
    {
      headers: {
        "X-Tenant-Id": tenantId.toString(),
      },
    },
  );
  return response.data;
}

interface NewUserFormState {
  email: string;
  full_name: string;
  role: "tenant_admin" | "user";
}

/**
 * Gestión de usuarios por tenant.
 *
 * Super Admin:
 *   - Puede seleccionar cualquier tenant.
 *
 * Admin de tenant:
 *   - Gestiona solo los usuarios de su propio tenant (sin selector).
 */
export const UsersPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");

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
    isSuperAdmin ? null : currentTenantId,
  );

  const [form, setForm] = useState<NewUserFormState>({
    email: "",
    full_name: "",
    role: "tenant_admin",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "super_admin" | "tenant_admin" | "user"
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );

  const {
    data: tenants,
    isLoading: isLoadingTenants,
    isError: isErrorTenants,
  } = useQuery<TenantOption[]>({
    queryKey: ["tenants-for-users"],
    queryFn: fetchTenants,
    enabled: isSuperAdmin,
    onSuccess: (data) => {
      if (isSuperAdmin && !selectedTenantId && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    },
  });

  const {
    data: users,
    isLoading: isLoadingUsers,
    isError: isErrorUsers,
  } = useQuery<User[]>({
    queryKey: ["users", selectedTenantId],
    queryFn: () => fetchUsers(selectedTenantId as number),
    enabled: selectedTenantId !== null,
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (payload: NewUserFormState) => {
      const { role, ...rest } = payload;
      await createUserInvitation({
        ...rest,
        tenant_id: selectedTenantId,
        role_name: role,
      });
    },
    onSuccess: () => {
      if (selectedTenantId) {
        queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
      }
      toast({
        title: "Invitación enviada",
        description:
          "Se ha enviado un correo de invitación al usuario para que complete su alta.",
        status: "success",
      });
      setForm({
        email: "",
        full_name: "",
        role: "tenant_admin",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        "No se ha podido enviar la invitación (revisa permisos y datos).";
      toast({
        title: "Error al enviar invitación",
        description: detail,
        status: "error",
      });
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedTenantId(Number.isNaN(id) ? null : id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createInvitationMutation.mutate(form);
  };

  const getRoleLabel = (user: User): string => {
    if (user.is_super_admin) return "Super Admin";
    if (user.role_id) return "Admin de tenant";
    return "Usuario";
  };

  const handleDeleteUser = (userId: number) => {
    apiClient
      .delete(`/api/v1/users/${userId}`)
      .then(() => {
        if (selectedTenantId) {
          queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
        }
        toast({
          title: "Usuario eliminado",
          description: "El usuario se ha eliminado correctamente.",
          status: "success",
        });
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          "No se ha podido eliminar el usuario (revisa permisos y datos).";
        toast({
          title: "Error al eliminar usuario",
          description: detail,
          status: "error",
        });
      });
  };

  const handleToggleActive = (user: User) => {
    apiClient
      .patch<User>(
        `/api/v1/users/${user.id}/status`,
        { is_active: !user.is_active },
        {
          headers: {
            "X-Tenant-Id": (selectedTenantId ?? "").toString(),
          },
        },
      )
      .then(() => {
        if (selectedTenantId) {
          queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
        }
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          "No se ha podido actualizar el estado del usuario.";
        toast({
          title: "Error al actualizar usuario",
          description: detail,
          status: "error",
        });
      });
  };

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((user) => {
      const matchesSearch =
        !searchTerm ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.full_name ?? "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "super_admin" && user.is_super_admin) ||
        (roleFilter === "tenant_admin" && !!user.role_id && !user.is_super_admin) ||
        (roleFilter === "user" && !user.role_id && !user.is_super_admin);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  return (
    <AppShell>
      <Heading mb={4}>Usuarios</Heading>
      <Text mb={6}>
        Gestión de usuarios internos de la organización por tenant (datos
        obtenidos del backend SaaS).
      </Text>

      {isSuperAdmin ? (
        <Box mb={4}>
          <FormControl maxW="320px">
            <FormLabel>Tenant</FormLabel>
            <Select
              placeholder={
                isLoadingTenants ? "Cargando tenants..." : "Selecciona un tenant"
              }
              value={selectedTenantId ?? ""}
              onChange={handleTenantChange}
              isDisabled={isLoadingTenants || isErrorTenants}
            >
              {(tenants ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.subdomain})
                </option>
              ))}
            </Select>
          </FormControl>
        </Box>
      ) : null}

      <Box
        as="form"
        onSubmit={handleSubmit}
        mb={8}
        borderWidth="1px"
        borderRadius="md"
        p={6}
        bg={cardBg}
      >
        <Heading as="h3" size="sm" mb={4}>
          Invitar usuario por correo
        </Heading>
        <VStack align="stretch" spacing={3}>
          <FormControl isRequired>
            <FormLabel>Nombre completo</FormLabel>
            <Input
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Nombre y apellidos"
            />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Email</FormLabel>
            <Input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="usuario@empresa.com"
            />
          </FormControl>
          <FormControl>
            <FormLabel>Rol</FormLabel>
            <Select name="role" value={form.role} onChange={handleChange}>
              <option value="tenant_admin">Administrador del tenant</option>
              <option value="user">Usuario estándar</option>
            </Select>
          </FormControl>
          <Button
            type="submit"
            colorScheme="blue"
            alignSelf="flex-start"
            isLoading={createInvitationMutation.isPending}
            isDisabled={!selectedTenantId}
          >
            Enviar invitación
          </Button>
        </VStack>
      </Box>

      {isLoadingUsers && <Text>Cargando usuarios...</Text>}
      {isErrorUsers && (
        <Text color="red.500" mb={4}>
          No se han podido cargar los usuarios (comprueba permisos y token).
        </Text>
      )}

      {!isLoadingUsers && users && (
        <>
          <Box mb={4}>
            <HStack spacing={4} align="flex-end" flexWrap="wrap">
              <FormControl maxW="260px">
                <FormLabel>Buscar</FormLabel>
                <Input
                  placeholder="Nombre o email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>Rol</FormLabel>
                <Select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(e.target.value as typeof roleFilter)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="super_admin">Super admin</option>
                  <option value="tenant_admin">Admin de tenant</option>
                  <option value="user">Usuario estándar</option>
                </Select>
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>Estado</FormLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="active">Solo activos</option>
                  <option value="inactive">Solo inactivos</option>
                </Select>
              </FormControl>
            </HStack>
          </Box>

          <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
            <Table size="sm">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th>Nombre</Th>
                  <Th>Email</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredUsers.length === 0 ? (
                  <Tr>
                    <Td colSpan={5}>
                      <Text fontSize="sm" color="gray.500">
                        No hay usuarios que coincidan con los filtros.
                      </Text>
                    </Td>
                  </Tr>
                ) : (
                  filteredUsers.map((user) => (
                    <Tr key={user.id}>
                      <Td>{user.full_name ?? "-"}</Td>
                      <Td>{user.email}</Td>
                      <Td>{getRoleLabel(user)}</Td>
                      <Td>
                        <HStack spacing={3}>
                          <Badge colorScheme={user.is_active ? "green" : "red"}>
                            {user.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                          <Switch
                            size="sm"
                            isChecked={user.is_active}
                            onChange={() => handleToggleActive(user)}
                          />
                        </HStack>
                      </Td>
                      <Td>
                        {!user.is_super_admin && (
                          <Button
                            size="xs"
                            colorScheme="red"
                            variant="outline"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            Eliminar
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </Box>
        </>
      )}
    </AppShell>
  );
};

