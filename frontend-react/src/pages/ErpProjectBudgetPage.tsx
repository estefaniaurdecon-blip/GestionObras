import React, { useMemo } from "react";
import {
  Box,
  Button,
  Heading,
  HStack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { BudgetModal, BudgetSection } from "../components/erp";
import { fetchErpProject, type ErpProject } from "../api/erpReports";
import { fetchMilestones, type ErpMilestone } from "../api/erpStructure";
import { useBudgetEditor } from "../hooks/erp";
import { useCurrentUser } from "../hooks/useCurrentUser";

export const ErpProjectBudgetPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const router = useRouter();
  const subtleText = useColorModeValue("gray.600", "gray.300");

  const numericProjectId = projectId ? Number(projectId) : NaN;
  const isValidProject = Number.isFinite(numericProjectId);

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const tenantId = currentUser?.tenant_id ?? null;
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId ?? undefined;

  const projectQuery = useQuery<ErpProject>({
    queryKey: ["erp-project", numericProjectId, effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProject(numericProjectId, effectiveTenantId),
    enabled: isValidProject,
  });

  const milestonesQuery = useQuery<ErpMilestone[]>({
    queryKey: [
      "erp-project-milestones",
      numericProjectId,
      effectiveTenantId ?? "all",
    ],
    queryFn: () => fetchMilestones({ projectId: numericProjectId }, effectiveTenantId),
    enabled: isValidProject,
  });

  const projectMilestones = milestonesQuery.data ?? [];

  const budgetEditor = useBudgetEditor({
    projectId: isValidProject ? numericProjectId : null,
    projectMilestones,
    tenantId: effectiveTenantId,
  });

  const selectedProject: ErpProject | null = useMemo(() => {
    if (!projectQuery.data) return null;
    return projectQuery.data;
  }, [projectQuery.data]);

  return (
    <AppShell>
      <HStack justify="space-between" align="flex-start" mb={6}>
        <Box>
          <Heading size="lg">Presupuesto del proyecto</Heading>
          <Text color={subtleText} fontSize="sm">
            {selectedProject?.name ?? "Proyecto"}
          </Text>
        </Box>
        <Button variant="outline" onClick={() => router.history.back()}>
          Volver
        </Button>
      </HStack>

      {!isValidProject && (
        <Text color="red.500">Proyecto no valido.</Text>
      )}

      {isValidProject && (
        <BudgetSection
          projects={selectedProject ? [selectedProject] : []}
          budgetProjectFilter={String(numericProjectId)}
          onBudgetProjectChange={() => undefined}
          selectedBudgetProjectId={numericProjectId}
          budgetMilestonesCount={budgetEditor.budgetMilestonesCount}
          onAddBudgetMilestone={budgetEditor.addBudgetMilestone}
          budgetsEditMode={budgetEditor.budgetsEditMode}
          onToggleEditMode={() =>
            budgetEditor.setBudgetsEditMode((prev) => !prev)
          }
          canEditBudgets={budgetEditor.canEditBudgets}
          onSaveTable={budgetEditor.handleBudgetSaveAll}
          hasBudgetDrafts={budgetEditor.hasBudgetDrafts}
          savingBudgets={budgetEditor.savingBudgets}
          hasRealBudgets={budgetEditor.hasRealBudgets}
          onSeedTemplate={budgetEditor.seedTemplateBudgetLines}
          seedingTemplate={budgetEditor.seedingTemplate}
          budgetsQueryState={budgetEditor.budgetsQueryState}
          displayBudgetRows={budgetEditor.displayBudgetRows}
          groupedBudgetRows={budgetEditor.groupedBudgetRows}
          budgetDrafts={budgetEditor.budgetDrafts}
          generalExpensesMode={budgetEditor.generalExpensesMode}
          onGeneralExpensesModeChange={(budgetId, mode) =>
            budgetEditor.setGeneralExpensesMode((prev) => ({
              ...prev,
              [budgetId]: mode,
            }))
          }
          onGeneralExpensesPercent={budgetEditor.handleGeneralExpensesPercent}
          onGeneralExpensesAmount={budgetEditor.handleGeneralExpensesAmount}
          externalCollaborations={budgetEditor.externalCollaborations}
          isExternalCollaborationsLoading={
            budgetEditor.isExternalCollaborationsLoading
          }
          externalCollabSelections={budgetEditor.externalCollabSelections}
          onExternalCollabSelectionChange={(budgetId, value) =>
            budgetEditor.setExternalCollabSelections((prev) => ({
              ...prev,
              [budgetId]: value,
            }))
          }
          onAddExternalCollaborationRow={
            budgetEditor.handleAddExternalCollaborationRow
          }
          onBudgetCellSave={budgetEditor.handleBudgetCellSave}
          onOpenBudgetModal={budgetEditor.openBudgetModal}
          onRemoveExternalCollaborationRow={
            budgetEditor.handleRemoveExternalCollaborationRow
          }
          budgetParentMap={budgetEditor.budgetParentMap}
          budgetParentTotals={budgetEditor.budgetParentTotals}
          budgetsTabTotals={budgetEditor.budgetsTabTotals}
          budgetsDiffH1={budgetEditor.budgetsDiffH1}
          budgetsDiffH2={budgetEditor.budgetsDiffH2}
          subtleText={subtleText}
          externalCollabSelectPlaceholder="Selecciona colaborador"
        />
      )}

      <BudgetModal
        isOpen={budgetEditor.budgetModalOpen}
        onClose={budgetEditor.closeBudgetModal}
        onSave={budgetEditor.handleBudgetSave}
        initialValues={budgetEditor.budgetModalInitial}
        title={
          budgetEditor.budgetModalMode === "edit"
            ? "Editar presupuesto"
            : "Agregar presupuesto"
        }
        submitLabel={
          budgetEditor.budgetModalMode === "edit" ? "Actualizar" : "Guardar"
        }
        isSaving={budgetEditor.isBudgetModalSaving}
      />
    </AppShell>
  );
};

export default ErpProjectBudgetPage;
