import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
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
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { deleteUser, createUserInvitation, fetchAllTenants, fetchUsersByTenant, type TenantOption, type TenantUserSummary, updateUser, updateUserStatus } from "../api/users";
import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";
import { useCurrentUser } from "../hooks/useCurrentUser";

type EditableRole = "tenant_admin" | "user";

interface UserFormState {
  email: string;
  full_name: string;
  role: EditableRole;
}

const defaultInviteForm = (): UserFormState => ({
  email: "",
  full_name: "",
  role: "tenant_admin",
});

const defaultEditForm = (): UserFormState => ({
  email: "",
  full_name: "",
  role: "user",
});

const getErrorDetail = (error: unknown, fallback: string): string => {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "detail" in error.response.data &&
    typeof error.response.data.detail === "string"
  ) {
    return error.response.data.detail;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const resolveRole = (user: TenantUserSummary): EditableRole => {
  return user.role_name === "tenant_admin" ? "tenant_admin" : "user";
};

export const UsersPage: React.FC = () => {
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUserSummary | null>(null);
  const [isGerenciaEditing, setIsGerenciaEditing] = useState(false);
  const [form, setForm] = useState<UserFormState>(defaultInviteForm);
  const [editForm, setEditForm] = useState<UserFormState>(defaultEditForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "super_admin" | "tenant_admin" | "gerencia" | "user"
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );

  const tenantsQuery = useQuery<TenantOption[]>({
    queryKey: ["tenants-for-users"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (isSuperAdmin) {
      if (selectedTenantId !== null) return;
      if (tenantsQuery.data?.length) {
        setSelectedTenantId(tenantsQuery.data[0].id);
      }
      return;
    }
    if (currentTenantId === null) return;
    if (selectedTenantId === currentTenantId) return;
    setSelectedTenantId(currentTenantId);
  }, [currentTenantId, isSuperAdmin, selectedTenantId, tenantsQuery.data]);

  const usersQuery = useQuery<TenantUserSummary[]>({
    queryKey: ["users", selectedTenantId],
    queryFn: () => fetchUsersByTenant(selectedTenantId as number),
    enabled: selectedTenantId !== null,
  });

  const invalidateUsers = async () => {
    if (selectedTenantId === null) return;
    await queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
  };

  const createInvitationMutation = useMutation({
    mutationFn: async (payload: UserFormState) => {
      if (selectedTenantId === null) {
        throw new Error(t("users.tenant.placeholder"));
      }
      await createUserInvitation({
        email: payload.email,
        full_name: payload.full_name || null,
        tenant_id: selectedTenantId,
        role_name: payload.role,
      });
    },
    onSuccess: async () => {
      await invalidateUsers();
      toast({
        title: t("users.messages.inviteSuccessTitle"),
        description: t("users.messages.inviteSuccessDesc"),
        status: "success",
      });
      setForm(defaultInviteForm());
      setInviteOpen(false);
    },
    onError: (error) => {
      toast({
        title: t("users.messages.inviteErrorTitle"),
        description: getErrorDetail(error, t("users.messages.inviteErrorFallback")),
        status: "error",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload: {
      id: number;
      email: string;
      full_name: string;
      role?: EditableRole;
    }) => {
      return updateUser(
        payload.id,
        {
          email: payload.email,
          full_name: payload.full_name,
          role_name: payload.role,
        },
        selectedTenantId,
      );
    },
    onSuccess: async () => {
      await invalidateUsers();
      toast({
        title: t("users.messages.updateSuccessTitle"),
        description: t("users.messages.updateSuccessDesc"),
        status: "success",
      });
      setEditOpen(false);
      setEditingUser(null);
    },
    onError: (error) => {
      toast({
        title: t("users.messages.updateErrorTitle"),
        description: getErrorDetail(error, t("users.messages.updateErrorFallback")),
        status: "error",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => deleteUser(userId, selectedTenantId),
    onSuccess: async () => {
      await invalidateUsers();
      toast({
        title: t("users.messages.deleteSuccessTitle"),
        description: t("users.messages.deleteSuccessDesc"),
        status: "success",
      });
    },
    onError: (error) => {
      toast({
        title: t("users.messages.deleteErrorTitle"),
        description: getErrorDetail(error, t("users.messages.deleteErrorFallback")),
        status: "error",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { userId: number; isActive: boolean }) =>
      updateUserStatus(payload.userId, payload.isActive, selectedTenantId),
    onSuccess: async () => {
      await invalidateUsers();
    },
    onError: (error) => {
      toast({
        title: t("users.messages.statusErrorTitle"),
        description: getErrorDetail(error, t("users.messages.statusErrorFallback")),
        status: "error",
      });
    },
  });

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const openEditUser = (user: TenantUserSummary) => {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      full_name: user.full_name ?? "",
      role: resolveRole(user),
    });
    setIsGerenciaEditing(user.role_name === "gerencia");
    setEditOpen(true);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createInvitationMutation.mutate(form);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateUserMutation.mutate({
      id: editingUser.id,
      email: editForm.email,
      full_name: editForm.full_name,
      role: isGerenciaEditing ? undefined : editForm.role,
    });
  };

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number.parseInt(e.target.value, 10);
    setSelectedTenantId(Number.isNaN(value) ? null : value);
  };

  const handleDeleteUser = (user: TenantUserSummary) => {
    const confirmed = window.confirm(
      `${t("users.table.delete")}: ${user.full_name || user.email}`,
    );
    if (!confirmed) return;
    deleteUserMutation.mutate(user.id);
  };

  const getRoleLabel = (user: TenantUserSummary): string => {
    if (user.is_super_admin) return t("users.roles.superAdmin");
    if (user.role_name === "tenant_admin") return t("users.roles.tenantAdmin");
    if (user.role_name === "gerencia") return "Gerencia";
    return t("users.roles.standard");
  };

  const filteredUsers = useMemo(() => {
    const users = usersQuery.data ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        (user.full_name ?? "").toLowerCase().includes(normalizedSearch);

      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "super_admin" && user.is_super_admin) ||
        (roleFilter === "tenant_admin" &&
          user.role_name === "tenant_admin" &&
          !user.is_super_admin) ||
        (roleFilter === "gerencia" &&
          user.role_name === "gerencia" &&
          !user.is_super_admin) ||
        (roleFilter === "user" &&
          !user.is_super_admin &&
          user.role_name !== "tenant_admin" &&
          user.role_name !== "gerencia");

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchTerm, statusFilter, usersQuery.data]);

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
                tenantsQuery.isLoading
                  ? t("users.tenant.loading")
                  : t("users.tenant.placeholder")
              }
              value={selectedTenantId !== null ? String(selectedTenantId) : ""}
              onChange={handleTenantChange}
              isDisabled={tenantsQuery.isLoading || tenantsQuery.isError}
            >
              {(tenantsQuery.data ?? []).map((tenant) => (
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
          isDisabled={selectedTenantId === null}
        >
          {t("users.invite.submit")}
        </Button>
      </HStack>

      {usersQuery.isLoading && <Text>{t("users.list.loading")}</Text>}
      {usersQuery.isError && (
        <Text color="red.500" mb={4}>
          {t("users.list.loadError")}
        </Text>
      )}

      {!usersQuery.isLoading && selectedTenantId === null && (
        <Text color={subtleText} mb={4}>
          {t("users.tenant.placeholder")}
        </Text>
      )}

      {!usersQuery.isLoading && usersQuery.data && (
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
                  <option value="gerencia">Gerencia</option>
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
                    <Th />
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
                        <Td>{user.full_name || "-"}</Td>
                        <Td>{user.email}</Td>
                        <Td>{getRoleLabel(user)}</Td>
                        <Td>
                          <HStack spacing={3}>
                            <Badge colorScheme={user.is_active ? "green" : "red"}>
                              {user.is_active
                                ? t("users.table.active")
                                : t("users.table.inactive")}
                            </Badge>
                            <Switch
                              size="sm"
                              isChecked={user.is_active}
                              onChange={() =>
                                updateStatusMutation.mutate({
                                  userId: user.id,
                                  isActive: !user.is_active,
                                })
                              }
                              isDisabled={updateStatusMutation.isPending}
                            />
                          </HStack>
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            {!user.is_super_admin && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => openEditUser(user)}
                              >
                                {t("users.table.edit")}
                              </Button>
                            )}
                            {!user.is_super_admin && (
                              <Button
                                size="xs"
                                colorScheme="red"
                                variant="outline"
                                onClick={() => handleDeleteUser(user)}
                                isDisabled={deleteUserMutation.isPending}
                              >
                                {t("users.table.delete")}
                              </Button>
                            )}
                          </HStack>
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
        <ModalContent as="form" onSubmit={handleInviteSubmit}>
          <ModalHeader>{t("users.invite.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl isRequired>
                <FormLabel>{t("users.invite.fullName")}</FormLabel>
                <Input
                  name="full_name"
                  value={form.full_name}
                  onChange={handleFormChange}
                  placeholder={t("users.invite.fullNamePlaceholder")}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("users.invite.email")}</FormLabel>
                <Input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleFormChange}
                  placeholder={t("users.invite.emailPlaceholder")}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("users.invite.role")}</FormLabel>
                <Select name="role" value={form.role} onChange={handleFormChange}>
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
              isDisabled={selectedTenantId === null}
            >
              {t("users.invite.submit")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleEditSubmit}>
          <ModalHeader>{t("users.edit.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl isRequired>
                <FormLabel>{t("users.edit.fullName")}</FormLabel>
                <Input
                  name="full_name"
                  value={editForm.full_name}
                  onChange={handleEditFormChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("users.edit.email")}</FormLabel>
                <Input
                  name="email"
                  type="email"
                  value={editForm.email}
                  onChange={handleEditFormChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("users.edit.role")}</FormLabel>
                <Select
                  name="role"
                  value={editForm.role}
                  onChange={handleEditFormChange}
                  isDisabled={isGerenciaEditing}
                >
                  <option value="tenant_admin">{t("users.roles.tenantAdmin")}</option>
                  <option value="user">{t("users.roles.standard")}</option>
                </Select>
                {isGerenciaEditing && (
                  <Text fontSize="xs" color={subtleText}>
                    El rol de Gerencia se asigna automaticamente por departamento.
                  </Text>
                )}
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              colorScheme="green"
              isLoading={updateUserMutation.isPending}
              isDisabled={selectedTenantId === null}
            >
              {t("users.edit.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppShell>
  );
};
