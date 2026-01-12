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
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";
import type { CurrentUser } from "../api/users";

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
export const TenantSettingsPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");

  let isSuperAdmin = false;
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const me = JSON.parse(raw) as CurrentUser;
      isSuperAdmin = Boolean(me.is_super_admin);
    }
  } catch {
    isSuperAdmin = false;
  }

  const [form, setForm] = useState<NewTenantFormState>({
    name: "",
    subdomain: "",
    is_active: true,
    admin_email: "",
    admin_password: "",
  });

  const { data: tenants, isLoading, isError } = useQuery<Tenant[]>({
    queryKey: ["tenants"],
    queryFn: fetchTenants,
    enabled: isSuperAdmin,
  });

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
        title: "Tenant creado",
        description: "El tenant y su administrador se han creado correctamente.",
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
        "No se ha podido crear el tenant o su administrador (revisa permisos y datos).";
      toast({
        title: "Error al crear tenant",
        description: detail,
        status: "error",
      });
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTenantMutation.mutate(form);
  };

  const handleDeleteTenant = (tenantId: number) => {
    apiClient
      .delete(`/api/v1/tenants/${tenantId}`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["tenants"] });
        toast({
          title: "Tenant eliminado",
          description: "El tenant se ha eliminado correctamente.",
          status: "success",
        });
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          "No se ha podido eliminar el tenant (revisa permisos y datos).";
        toast({
          title: "Error al eliminar tenant",
          description: detail,
          status: "error",
        });
      });
  };

  return (
    <AppShell>
      <Heading mb={4}>Ajustes del tenant</Heading>
      {!isSuperAdmin && (
        <Text mb={6}>
          Solo el Super Admin global puede ver y gestionar la lista completa de tenants.
        </Text>
      )}
      {isSuperAdmin && (
        <Text mb={6}>
          Configuración general de empresas/tenants dentro de la plataforma. Al crear un
          tenant, también se crea su administrador principal.
        </Text>
      )}

      {isSuperAdmin && (
        <>
          <Box
            as="form"
            onSubmit={handleSubmit}
            maxW="480px"
            borderWidth="1px"
            borderRadius="md"
            p={6}
            bg={cardBg}
          >
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Nombre del tenant</FormLabel>
                <Input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Nombre comercial"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Subdominio</FormLabel>
                <Input
                  name="subdomain"
                  value={form.subdomain}
                  onChange={handleChange}
                  placeholder="acme, empresa, etc."
                />
              </FormControl>
              <FormControl>
                <FormLabel>Activo</FormLabel>
                <Switch
                  name="is_active"
                  isChecked={form.is_active}
                  onChange={handleChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Email del admin del tenant</FormLabel>
                <Input
                  name="admin_email"
                  type="email"
                  value={form.admin_email}
                  onChange={handleChange}
                  placeholder="admin@empresa.com"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Contraseña del admin del tenant</FormLabel>
                <Input
                  name="admin_password"
                  type="password"
                  value={form.admin_password}
                  onChange={handleChange}
                />
              </FormControl>
              <Button
                type="submit"
                colorScheme="blue"
                isLoading={createTenantMutation.isPending}
              >
                Crear tenant y admin
              </Button>
            </Stack>
          </Box>

          <Box mt={10}>
            <Heading as="h3" size="sm" mb={4}>
              Tenants existentes
            </Heading>

            {isLoading && <Text>Cargando tenants...</Text>}
            {isError && (
              <Text color="red.500">
                No se han podido cargar los tenants (comprueba permisos y token).
              </Text>
            )}

            {!isLoading && tenants && (
              <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
                <Table size="sm">
                  <Thead bg={tableHeadBg}>
                    <Tr>
                      <Th>Nombre</Th>
                      <Th>Subdominio</Th>
                      <Th>Activo</Th>
                      <Th>Creado el</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {tenants.map((tenant) => (
                      <Tr key={tenant.id}>
                        <Td>{tenant.name}</Td>
                        <Td>{tenant.subdomain}</Td>
                        <Td>{tenant.is_active ? "Sí" : "No"}</Td>
                        <Td>{new Date(tenant.created_at).toLocaleString()}</Td>
                        <Td>
                          <Button
                            size="xs"
                            colorScheme="red"
                            variant="outline"
                            onClick={() => handleDeleteTenant(tenant.id)}
                          >
                            Eliminar
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </Box>
        </>
      )}
    </AppShell>
  );
}
