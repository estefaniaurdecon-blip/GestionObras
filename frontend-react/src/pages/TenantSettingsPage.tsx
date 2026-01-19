import React, { useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
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
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";
import { useCurrentUser } from "../hooks/useCurrentUser";

interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  is_active: boolean;
  created_at: string;
}

async function fetchTenants(): Promise<Tenant[]> {
  const response = await apiClient.get<Tenant[]>("/api/v1/tenants/");
  return response.data;
}

interface NewTenantFormState {
  name: string;
  subdomain: string;
  is_active: boolean;
  admin_email: string;
  admin_password: string;
}

/**
 * Página de ajustes y gestión de tenants (empresas).
 *
 * Permite crear nuevos tenants y ver el listado actual.
 * Al crear un tenant, también se crea su administrador principal.
 */
// Pantalla de administracion de tenants y sus administradores.
export const TenantSettingsPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Estado del formulario de alta de tenant.
  const [form, setForm] = useState<NewTenantFormState>({
    name: "",
    subdomain: "",
    is_active: true,
    admin_email: "",
    admin_password: "",
  });

  // Carga de tenants existentes.
  const { data: tenants, isLoading, isError } = useQuery<Tenant[]>({
    queryKey: ["tenants"],
    queryFn: fetchTenants,
    enabled: isSuperAdmin,
  });

  // Mutacion para crear tenant y admin.
  const createTenantMutation = useMutation({
    mutationFn: async (payload: NewTenantFormState) => {
      const tenantResponse = await apiClient.post<Tenant>("/api/v1/tenants/", {
        name: payload.name,
        subdomain: payload.subdomain,
        is_active: payload.is_active,
      });
      const tenant = tenantResponse.data;

      await apiClient.post(
        "/api/v1/users/",
        {
          email: payload.admin_email,
          full_name: `Admin ${tenant.name}`,
          password: payload.admin_password,
          tenant_id: tenant.id,
          is_super_admin: false,
          role_name: "tenant_admin",
        },
        {
          headers: {
            "X-Tenant-Id": tenant.id.toString(),
          },
        },
      );

      return tenant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({
        title: t("tenantSettings.messages.createSuccessTitle"),
        description: t("tenantSettings.messages.createSuccessDesc"),
        status: "success",
      });
      setForm({
        name: "",
        subdomain: "",
        is_active: true,
        admin_email: "",
        admin_password: "",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("tenantSettings.messages.createErrorFallback");
      toast({
        title: t("tenantSettings.messages.createErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Actualiza el formulario segun inputs.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Envia el formulario para crear tenant.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTenantMutation.mutate(form);
  };

  // Elimina un tenant existente.
  const handleDeleteTenant = (tenantId: number) => {
    apiClient
      .delete(`/api/v1/tenants/${tenantId}`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["tenants"] });
        toast({
          title: t("tenantSettings.messages.deleteSuccessTitle"),
          description: t("tenantSettings.messages.deleteSuccessDesc"),
          status: "success",
        });
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          t("tenantSettings.messages.deleteErrorFallback");
        toast({
          title: t("tenantSettings.messages.deleteErrorTitle"),
          description: detail,
          status: "error",
        });
      });
  };

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
        <Stack position="relative" spacing={2} maxW="640px">
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">{t("tenantSettings.header.eyebrow")}</Text>
          <Heading size="lg">{t("tenantSettings.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("tenantSettings.header.subtitle")}
          </Text>
        </Stack>
      </Box>
      {!isSuperAdmin && (
        <Text mb={6}>
          {t("tenantSettings.permissions.onlySuperAdmin")}
        </Text>
      )}
      {isSuperAdmin && (
        <Text mb={6}>          {t("tenantSettings.description")}
        </Text>
      )}

      {isSuperAdmin && (
        <>
          <Box mt={2}>
            <Stack direction={{ base: "column", md: "row" }} justify="space-between" align="center" mb={4}>
              <Heading as="h3" size="sm">{t("tenantSettings.list.title")}</Heading>
              <Button colorScheme="green" size="sm" onClick={() => setCreateModalOpen(true)}>
                {t("tenantSettings.actions.create")}
              </Button>
            </Stack>

            {isLoading && <Text>{t("tenantSettings.list.loading")}</Text>}
            {isError && (
              <Text color="red.500">
                {t("tenantSettings.list.error")}
              </Text>
            )}

            {!isLoading && tenants && (
              <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
                <Table size="sm">
                  <Thead bg={tableHeadBg}>
                    <Tr>
                      <Th>{t("tenantSettings.list.name")}</Th>
                      <Th>{t("tenantSettings.fields.subdomain")}</Th>
                      <Th>{t("tenantSettings.fields.active")}</Th>
                      <Th>{t("tenantSettings.list.createdAt")}</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {tenants.map((tenant) => (
                      <Tr key={tenant.id}>
                        <Td>{tenant.name}</Td>
                        <Td>{tenant.subdomain}</Td>
                        <Td>{tenant.is_active
                          ? t("tenantSettings.list.yes")
                          : t("tenantSettings.list.no")}</Td>
                        <Td>{new Date(tenant.created_at).toLocaleString()}</Td>
                        <Td>
                          <Button
                            size="xs"
                            colorScheme="red"
                            variant="outline"
                            onClick={() => handleDeleteTenant(tenant.id)}
                          >{t("tenantSettings.actions.delete")}</Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </Box>

          <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} size="lg">
            <ModalOverlay />
            <ModalContent as="form" onSubmit={handleSubmit}>
              <ModalHeader>{t("tenantSettings.actions.create")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Stack spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.name")}</FormLabel>
                    <Input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder={t("tenantSettings.placeholders.name")}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.subdomain")}</FormLabel>
                    <Input
                      name="subdomain"
                      value={form.subdomain}
                      onChange={handleChange}
                      placeholder={t("tenantSettings.placeholders.subdomain")}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("tenantSettings.fields.active")}</FormLabel>
                    <Switch
                      name="is_active"
                      isChecked={form.is_active}
                      onChange={handleChange}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.adminEmail")}</FormLabel>
                    <Input
                      name="admin_email"
                      type="email"
                      value={form.admin_email}
                      onChange={handleChange}
                      placeholder={t("tenantSettings.placeholders.adminEmail")}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.adminPassword")}</FormLabel>
                    <Input
                      name="admin_password"
                      type="password"
                      value={form.admin_password}
                      onChange={handleChange}
                    />
                  </FormControl>
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" mr={3} onClick={() => setCreateModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  colorScheme="green"
                  type="submit"
                  isLoading={createTenantMutation.isPending}
                >
                  {t("tenantSettings.actions.create")}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </>
      )}
    </AppShell>
  );
}
