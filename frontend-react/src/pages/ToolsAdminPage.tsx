import React, { useEffect, useState } from "react";
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
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";
import {
  fetchToolCatalog,
  fetchTenantTools,
  setTenantToolEnabled,
  Tool,
} from "../api/tools";
import { useCurrentUser } from "../hooks/useCurrentUser";

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
// Pantalla de herramientas por tenant.
export const ToolsAdminPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  useEffect(() => {
    if (!currentUser?.tenant_id) return;
    if (selectedTenantId !== null) return;
    if (!isSuperAdmin) {
      setSelectedTenantId(currentUser.tenant_id);
    }
  }, [currentUser?.tenant_id, isSuperAdmin, selectedTenantId]);

  // Catalogo global de herramientas.
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

  // Herramientas habilitadas para el tenant seleccionado.
  const { data: tenantTools, isLoading: isTenantLoading } = useQuery<Tool[]>({
    queryKey: ["tenant-tools-admin", selectedTenantId],
    queryFn: () => fetchTenantTools(selectedTenantId as number),
    enabled: selectedTenantId !== null,
  });

  // Activar/desactivar herramienta para un tenant.
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
        title: t("toolsAdmin.messages.updateSuccessTitle"),
        description: t("toolsAdmin.messages.updateSuccessDesc"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("toolsAdmin.messages.updateErrorFallback");
      toast({
        title: t("toolsAdmin.messages.updateErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const tenantToolIds = new Set(tenantTools?.map((t) => t.id) ?? []);

  // Cambia el tenant seleccionado en la vista.
  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedTenantId(Number.isNaN(id) ? null : id);
  };

  // Alterna el estado de una herramienta.
  const handleToggle = (toolId: number, enabled: boolean) => {
    if (!selectedTenantId) return;
    toggleMutation.mutate({
      tenantId: selectedTenantId,
      toolId,
      nextEnabled: !enabled,
    });
  };

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("toolsAdmin.header.eyebrow")}
          title={t("toolsAdmin.header.title")}
          subtitle={t("toolsAdmin.header.subtitle")}
        />
      </Box>

      {isSuperAdmin && (
        <Box mb={4}>
          <FormControl maxW="320px">
            <FormLabel>{t("toolsAdmin.filters.tenant")}</FormLabel>
            <Select
              placeholder={
                isLoadingTenants
                ? t("toolsAdmin.filters.loadingTenants")
                : t("toolsAdmin.filters.selectTenant")
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
                {t("toolsAdmin.filters.loadTenantsError")}
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
        <Text>{t("toolsAdmin.loading")}</Text>
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
                  {tool.description ?? t("toolsAdmin.catalog.fallbackDescription")}
                </Text>
                <Badge colorScheme={enabled ? "green" : "gray"} mb={3}>
                  {enabled
                  ? t("toolsAdmin.catalog.enabled")
                  : t("toolsAdmin.catalog.disabled")}
                </Badge>
                <Button
                  size="sm"
                  variant={enabled ? "outline" : "solid"}
                  colorScheme={enabled ? "red" : "green"}
                  onClick={() => handleToggle(tool.id, enabled)}
                  isLoading={toggleMutation.isPending}
                >
                  {enabled
                  ? t("toolsAdmin.actions.disable")
                  : t("toolsAdmin.actions.enable")}
                </Button>
              </Box>
            );
          })}
        </SimpleGrid>
      )}
    </AppShell>
  );
};
