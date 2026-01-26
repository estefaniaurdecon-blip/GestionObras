import React, { useEffect, useState } from "react";

import {
  Box,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  Select,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { SimulationPanel, SimulationsList } from "../components/erp";
import { fetchAllTenants, type TenantOption } from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useSimulations } from "../hooks/erp";

export const ErpSimulationsPage: React.FC = () => {
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
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
    setExpenseAmount,
    isLoading,
  } = useSimulations(effectiveTenantId);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <AppShell>
      <Box mb={6}>
        <Heading size="lg">Simulaciones</Heading>
        <Text fontSize="sm" color={subtleText}>
          Configura presupuestos y gastos para evaluar la viabilidad.
        </Text>
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
