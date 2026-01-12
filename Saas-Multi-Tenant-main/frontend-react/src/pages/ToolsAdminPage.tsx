import React, { useState } from "react";
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Badge,
  Button,
  FormControl,
  FormLabel,
  Select,
  useToast,
  useColorModeValue,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import {
  fetchToolCatalog,
  fetchTenantTools,
  setTenantToolEnabled,
  Tool,
} from "../api/tools";
import type { CurrentUser } from "../api/users";

interface TenantOption {
  id: number;
  name: string;
  subdomain: string;
}

async function fetchTenants(): Promise<TenantOption[]> {
  const response = await import("../api/client").then(({ apiClient }) =>
    apiClient.get<TenantOption[]>("/api/v1/tenants/"),
  );
  return response.data;
}

/**
 * Página de administración de herramientas por tenant.
 *
 * Muestra el catálogo global y cuáles están habilitadas para el tenant actual.
 * - Como Super Admin: puedes seleccionar el tenant y activar/desactivar herramientas.
 * - Como admin_tenant: gestionas las herramientas de tu tenant.
 */
export const ToolsAdminPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");

  let isSuperAdmin = false;
  let initialTenantId: number | null = null;

  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const me = JSON.parse(raw) as CurrentUser;
      isSuperAdmin = Boolean(me.is_super_admin);
      if (me.tenant_id) {
        initialTenantId = me.tenant_id;
      }
    }
  } catch {
    isSuperAdmin = false;
    initialTenantId = null;
  }

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(initialTenantId);

  const { data: catalog, isLoading: isCatalogLoading } = useQuery<Tool[]>({
    queryKey: ["tool-catalog"],
    queryFn: fetchToolCatalog,
  });

  const {
    data: tenants,
    isLoading: isLoadingTenants,
    isError: isErrorTenants,
  } = useQuery<TenantOption[]>({
    queryKey: ["tenants-for-tools"],
    queryFn: fetchTenants,
    enabled: isSuperAdmin,
    onSuccess: (data) => {
      if (isSuperAdmin && selectedTenantId === null && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    },
  });

  const { data: tenantTools, isLoading: isTenantLoading } = useQuery<Tool[]>({
    queryKey: ["tenant-tools-admin", selectedTenantId],
    queryFn: () => fetchTenantTools(selectedTenantId as number),
    enabled: selectedTenantId !== null,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      tenantId,
      toolId,
      nextEnabled,
    }: {
      tenantId: number;
      toolId: number;
      nextEnabled: boolean;
    }) => {
      await setTenantToolEnabled(tenantId, toolId, nextEnabled);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["tenant-tools-admin", variables.tenantId],
      });
      toast({
        title: "Herramienta actualizada",
        description: "El estado de la herramienta se ha actualizado correctamente.",
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido actualizar la herramienta (revisa permisos y datos).";
      toast({
        title: "Error al actualizar herramienta",
        description: detail,
        status: "error",
      });
    },
  });

  const tenantToolIds = new Set(tenantTools?.map((t) => t.id) ?? []);

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedTenantId(Number.isNaN(id) ? null : id);
  };

  const handleToggle = (toolId: number, enabled: boolean) => {
    if (!selectedTenantId) return;
    toggleMutation.mutate({
      tenantId: selectedTenantId,
      toolId,
      nextEnabled: !enabled,
    });
  };

  return (
    <AppShell>
      <Heading mb={4}>Herramientas del tenant</Heading>

      {isSuperAdmin && (
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
              {tenants?.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.subdomain})
                </option>
              ))}
            </Select>
            {isErrorTenants && (
              <Text mt={2} color="red.500" fontSize="sm">
                No se han podido cargar los tenants (comprueba permisos y token).
              </Text>
            )}
          </FormControl>
        </Box>
      )}

      <Text mb={6}>
        Configuración de herramientas externas (Moodle, ERP, BI, etc.) habilitadas para
        este tenant.
      </Text>

      {(isCatalogLoading || isTenantLoading || (isSuperAdmin && !selectedTenantId)) && (
        <Text>Cargando herramientas...</Text>
      )}

      {!isCatalogLoading && catalog && selectedTenantId && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {catalog.map((tool) => {
            const enabled = tenantToolIds.has(tool.id);
            return (
              <Box key={tool.id} borderWidth="1px" borderRadius="md" p={4} bg={cardBg}>
                <Heading size="sm" mb={2}>
                  {tool.name}
                </Heading>
                <Text fontSize="sm" mb={2} color={subtleText}>
                  {tool.description ?? "Herramienta integrada en la plataforma."}
                </Text>
                <Badge colorScheme={enabled ? "green" : "gray"} mb={3}>
                  {enabled ? "Habilitada para el tenant" : "No habilitada"}
                </Badge>
                <Button
                  size="sm"
                  variant={enabled ? "outline" : "solid"}
                  colorScheme={enabled ? "red" : "green"}
                  onClick={() => handleToggle(tool.id, enabled)}
                  isLoading={toggleMutation.isPending}
                >
                  {enabled ? "Deshabilitar" : "Habilitar"}
                </Button>
              </Box>
            );
          })}
        </SimpleGrid>
      )}
    </AppShell>
  );
};

