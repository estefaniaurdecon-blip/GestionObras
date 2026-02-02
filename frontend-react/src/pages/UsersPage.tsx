import React, { useEffect, useMemo, useState } from "react";
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";
import { apiClient } from "../api/client";
import { createUserInvitation } from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";

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
  role_name?: string | null;
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
 * Gestion de usuarios por tenant.
 *
 * Super Admin:
 *   - Puede seleccionar cualquier tenant.
 *
 * Admin de tenant:
 *   - Gestiona solo los usuarios de su propio tenant (sin selector).
 */
// Pantalla de gestion de usuarios: listado, filtros y acciones.
export const UsersPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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

  const [form, setForm] = useState<NewUserFormState>({
    email: "",
    full_name: "",
    role: "tenant_admin",
  });
  const [inviteOpen, setInviteOpen] = useState(false);

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
        title: t("users.messages.inviteSuccessTitle"),
        description: t("users.messages.inviteSuccessDesc"),
        status: "success",
      });
      setForm({
        email: "",
        full_name: "",
        role: "tenant_admin",
      });
      setInviteOpen(false);
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("users.messages.inviteErrorFallback");
      toast({
        title: t("users.messages.inviteErrorTitle"),
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
    if (user.is_super_admin) return t("users.roles.superAdmin");
    if (user.role_name === "tenant_admin") return t("users.roles.tenantAdmin");
    return t("users.roles.standard");
  };

  const handleDeleteUser = (userId: number) => {
    apiClient
      .delete(`/api/v1/users/${userId}`)
      .then(() => {
        if (selectedTenantId) {
          queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
        }
        toast({
          title: t("users.messages.deleteSuccessTitle"),
          description: t("users.messages.deleteSuccessDesc"),
          status: "success",
        });
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          t("users.messages.deleteErrorFallback");
        toast({
          title: t("users.messages.deleteErrorTitle"),
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
          t("users.messages.statusErrorFallback");
        toast({
          title: t("users.messages.statusErrorTitle"),
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
        (roleFilter === "tenant_admin" &&
          user.role_name === "tenant_admin" &&
          !user.is_super_admin) ||
        (roleFilter === "user" &&
          !user.is_super_admin &&
          user.role_name !== "tenant_admin");

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("users.header.eyebrow")}
          title={t("users.header.title")}
          subtitle={t("users.header.subtitle")}
        />
      </Box>

      {isSuperAdmin ? (
        <Box mb={6}>
          <FormControl maxW="320px">
            <FormLabel>{t("users.tenant.label")}</FormLabel>
            <Select
              placeholder={
                isLoadingTenants
                  ? t("users.tenant.loading")
                  : t("users.tenant.placeholder")
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

      <HStack mb={4} justify="space-between" align="center" flexWrap="wrap" spacing={4}>
        <Heading as="h3" size="md">
          {t("users.list.title")}
        </Heading>
        <Button
          colorScheme="green"
          size="sm"
          onClick={() => setInviteOpen(true)}
          isDisabled={!selectedTenantId}
        >
          {t("users.invite.submit")}
        </Button>
      </HStack>

      {isLoadingUsers && <Text>{t("users.list.loading")}</Text>}
      {isErrorUsers && (
        <Text color="red.500" mb={4}>
          {t("users.list.loadError")}
        </Text>
      )}

      {!isLoadingUsers && users && (
        <>
          <Box borderWidth="1px" borderRadius="xl" p={4} bg={panelBg} mb={6}>
            <HStack spacing={4} align="flex-end" flexWrap="wrap">
              <FormControl maxW="260px">
                <FormLabel>{t("users.filters.search")}</FormLabel>
                <Input
                  placeholder={t("users.filters.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>{t("users.filters.role")}</FormLabel>
                <Select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(e.target.value as typeof roleFilter)
                  }
                >
                  <option value="all">{t("users.filters.all")}</option>
                  <option value="super_admin">{t("users.roles.superAdmin")}</option>
                  <option value="tenant_admin">{t("users.roles.tenantAdmin")}</option>
                  <option value="user">{t("users.roles.standard")}</option>
                </Select>
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>{t("users.filters.status")}</FormLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                >
                  <option value="all">{t("users.filters.all")}</option>
                  <option value="active">{t("users.filters.activeOnly")}</option>
                  <option value="inactive">{t("users.filters.inactiveOnly")}</option>
                </Select>
              </FormControl>
            </HStack>
          </Box>

          <Box borderWidth="1px" borderRadius="xl" overflow="hidden" bg={cardBg}>
            <Box overflowX="auto">
              <Table size="sm" minW="760px">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th>{t("users.table.name")}</Th>
                  <Th>{t("users.table.email")}</Th>
                  <Th>{t("users.table.role")}</Th>
                  <Th>{t("users.table.status")}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredUsers.length === 0 ? (
                  <Tr>
                    <Td colSpan={5}>
                      <Text fontSize="sm" color={subtleText}>
                        {t("users.table.empty")}
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
                            {user.is_active ? t("users.table.active") : t("users.table.inactive")}
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
                            {t("users.table.delete")}
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
              </Table>
            </Box>
          </Box>
        </>
      )}

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleSubmit}>
          <ModalHeader>{t("users.invite.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl isRequired>
                <FormLabel>{t("users.invite.fullName")}</FormLabel>
                <Input
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder={t("users.invite.fullNamePlaceholder")}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("users.invite.email")}</FormLabel>
                <Input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder={t("users.invite.emailPlaceholder")}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("users.invite.role")}</FormLabel>
                <Select name="role" value={form.role} onChange={handleChange}>
                  <option value="tenant_admin">{t("users.roles.tenantAdmin")}</option>
                  <option value="user">{t("users.roles.standard")}</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setInviteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              colorScheme="green"
              isLoading={createInvitationMutation.isPending}
              isDisabled={!selectedTenantId}
            >
              {t("users.invite.submit")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </AppShell>
  );
};


