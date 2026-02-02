import React, { useEffect, useState } from "react";

import {
  Box,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  Select,
  Stack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { SimulationPanel, SimulationsList } from "../components/erp";
import { fetchAllTenants, type TenantOption } from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useSimulations } from "../hooks/erp";

export const ErpSimulationsPage: React.FC = () => {
  const { t } = useTranslation();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const tenantId = currentUser?.tenant_id ?? null;
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  // Selector de tenant solo para superadmin.
  const { data: tenants, isLoading: isLoadingTenants } = useQuery<TenantOption[]>({
    queryKey: ["simulations-tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
    onSuccess: (data) => {
      if (isSuperAdmin && !selectedTenantId && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    },
  });

  useEffect(() => {
    if (!isSuperAdmin && tenantId != null) {
      setSelectedTenantId(tenantId);
    }
  }, [isSuperAdmin, tenantId]);

  // Tenant efectivo usado para la API (superadmin debe elegirlo).
  const effectiveTenantId = isSuperAdmin
    ? selectedTenantId ?? undefined
    : tenantId ?? undefined;

  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    addProject,
    removeProject,
    addExpense,
    updateExpense,
    removeExpense,
    setProjectBudget,
    setProjectSubsidyPercent,
    setProjectThresholdPercent,
    setExpenseAmount,
    isLoading,
  } = useSimulations(effectiveTenantId);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <AppShell>
      <Box
        borderRadius="2xl"
        p={{ base: 6, md: 8 }}
        bgGradient="linear(120deg, var(--chakra-colors-brand-700) 0%, var(--chakra-colors-brand-500) 55%, var(--chakra-colors-brand-300) 110%)"
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
        <Stack position="relative" spacing={3}>
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            {t("simulations.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("simulations.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("simulations.header.subtitle")}
          </Text>
        </Stack>
      </Box>

      {isSuperAdmin && (
        <Box mb={6} bg={cardBg} borderWidth="1px" borderRadius="xl" p={4}>
          <FormControl maxW="320px">
            <FormLabel>Tenant</FormLabel>
            <Select
              value={selectedTenantId ?? ""}
              onChange={(event) =>
                setSelectedTenantId(event.target.value ? Number(event.target.value) : null)
              }
              placeholder={isLoadingTenants ? "Cargando tenants..." : "Selecciona un tenant"}
              isDisabled={isLoadingTenants}
            >
              {(tenants ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      <Grid templateColumns={{ base: "1fr", lg: "320px 1fr" }} gap={6}>
        <GridItem>
          <Box bg={cardBg} borderWidth="1px" borderRadius="xl" p={4}>
            <SimulationsList
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onAddProject={addProject}
              onRemoveProject={removeProject}
            />
          </Box>
        </GridItem>

        <GridItem>
          {isLoading ? (
            <Box bg={cardBg} borderWidth="1px" borderRadius="xl" p={6}>
              <Text color={subtleText}>Cargando simulaciones...</Text>
            </Box>
          ) : selectedProject ? (
            <SimulationPanel
              project={selectedProject}
              onBudgetChange={(value) =>
                setProjectBudget(selectedProject.id, value)
              }
              onPercentChange={(value) =>
                setProjectSubsidyPercent(selectedProject.id, value)
              }
              onThresholdChange={(value) =>
                setProjectThresholdPercent(selectedProject.id, value)
              }
              onAddExpense={() => addExpense(selectedProject.id)}
              onExpenseConceptChange={(expenseId, value) =>
                updateExpense(selectedProject.id, expenseId, { concept: value })
              }
              onExpenseAmountChange={(expenseId, value) =>
                setExpenseAmount(selectedProject.id, expenseId, value)
              }
              onRemoveExpense={(expenseId) =>
                removeExpense(selectedProject.id, expenseId)
              }
            />
          ) : (
            <Box bg={cardBg} borderWidth="1px" borderRadius="xl" p={6}>
              <Text color={subtleText}>
                Selecciona un proyecto o crea una simulacion nueva.
              </Text>
            </Box>
          )}
        </GridItem>
      </Grid>
    </AppShell>
  );
};
