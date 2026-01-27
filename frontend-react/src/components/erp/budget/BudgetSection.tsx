import React from "react";

import {
  Box,
  Button,
  Editable,
  EditableInput,
  EditablePreview,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
  Select,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Tfoot,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";

import type { ErpProject as ErpProjectApi } from "../../../api/erpReports";
import type {
  ProjectBudgetLine,
  ProjectBudgetLineUpdatePayload,
} from "../../../api/erpBudgets";
import type { ExternalCollaboration } from "../../../api/externalCollaborations";
import type { BudgetModalMode } from "../../../utils/erp";
import {
  CATEGORY_COLOR_MAP,
  DEFAULT_GENERAL_EXPENSES_PERCENT,
  EXTERNAL_COLLAB_LABEL,
  GENERAL_EXPENSES_LABEL,
  formatEuroValue,
  formatGeneralExpensesConcept,
  formatPercent,
  formatPercentLabelValue,
  getBudgetParentKey,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  parseExternalCollaborationDetails,
  parsePercentFromConcept,
} from "../../../utils/erp";
import { BudgetNumberCell, EuroCell } from "./BudgetCell";

interface BudgetTotals {
  hito1: number;
  hito2: number;
  approved: number;
  justificados?: number[];
  gasto: number;
}

interface BudgetSectionProps {
  projects: ErpProjectApi[];
  budgetProjectFilter: string;
  onBudgetProjectChange: (value: string) => void;
  selectedBudgetProjectId: number | null;
  budgetMilestonesCount: number;
  onAddBudgetMilestone: (nextIndex: number) => void;
  budgetsEditMode: boolean;
  onToggleEditMode: () => void;
  canEditBudgets: boolean;
  onSaveTable: () => void;
  hasBudgetDrafts: boolean;
  savingBudgets: boolean;
  hasRealBudgets: boolean;
  onSeedTemplate: () => void;
  seedingTemplate: boolean;
  budgetsQueryState: {
    isFetching: boolean;
    isError: boolean;
  };
  displayBudgetRows: ProjectBudgetLine[];
  groupedBudgetRows: ProjectBudgetLine[];
  budgetDrafts: Record<number, ProjectBudgetLineUpdatePayload>;
  generalExpensesMode: Record<number, "percent" | "amount">;
  onGeneralExpensesModeChange: (
    budgetId: number,
    mode: "percent" | "amount",
  ) => void;
  onGeneralExpensesPercent: (budgetId: number, value: string) => void;
  onGeneralExpensesAmount: (budgetId: number, value: string) => void;
  externalCollaborations: ExternalCollaboration[];
  isExternalCollaborationsLoading: boolean;
  externalCollabSelections: Record<number, string>;
  onExternalCollabSelectionChange: (budgetId: number, value: string) => void;
  onAddExternalCollaborationRow: (budgetId: number) => void;
  onBudgetCellSave: (
    budgetId: number,
    field: keyof ProjectBudgetLineUpdatePayload,
    value: string,
  ) => void;
  onOpenBudgetModal: (mode: BudgetModalMode, budget?: ProjectBudgetLine) => void;
  onRemoveExternalCollaborationRow: (budget: ProjectBudgetLine) => void;
  budgetParentMap: Record<string, string[]>;
  budgetParentTotals: Map<string, { j1: number; j2: number }>;
  budgetsTabTotals: BudgetTotals;
  budgetsDiffH1: number;
  budgetsDiffH2: number;
  subtleText: string;
  externalCollabSelectPlaceholder: string;
}

export const BudgetSection: React.FC<BudgetSectionProps> = ({
  projects,
  budgetProjectFilter,
  onBudgetProjectChange,
  selectedBudgetProjectId,
  budgetMilestonesCount,
  onAddBudgetMilestone,
  budgetsEditMode,
  onToggleEditMode,
  canEditBudgets,
  onSaveTable,
  hasBudgetDrafts,
  savingBudgets,
  hasRealBudgets,
  onSeedTemplate,
  seedingTemplate,
  budgetsQueryState,
  displayBudgetRows,
  groupedBudgetRows,
  budgetDrafts,
  generalExpensesMode,
  onGeneralExpensesModeChange,
  onGeneralExpensesPercent,
  onGeneralExpensesAmount,
  externalCollaborations,
  isExternalCollaborationsLoading,
  externalCollabSelections,
  onExternalCollabSelectionChange,
  onAddExternalCollaborationRow,
  onBudgetCellSave,
  onOpenBudgetModal,
  onRemoveExternalCollaborationRow,
  budgetParentMap,
  budgetParentTotals,
  budgetsTabTotals,
  budgetsDiffH1,
  budgetsDiffH2,
  subtleText,
  externalCollabSelectPlaceholder,
}) => {
  const selectedProject =
    selectedBudgetProjectId != null
      ? projects.find((project) => project.id === selectedBudgetProjectId) ?? null
      : null;
  const durationMonths = selectedProject?.duration_months ?? null;
  const durationLabel =
    durationMonths != null ? `${durationMonths} meses` : "Sin fechas";

  return (
    <Stack spacing={6}>
    <Heading size="md">Presupuestos</Heading>

    <Flex justify="space-between" align="flex-end" wrap="wrap" gap={4}>
      <FormControl minW="220px" maxW="320px">
        <FormLabel>Proyecto</FormLabel>
        <Select
          size="sm"
          value={budgetProjectFilter}
          onChange={(e) => onBudgetProjectChange(e.target.value)}
        >
          <option value="">Selecciona un proyecto</option>
          {projects.map((project) => (
            <option key={project.id} value={String(project.id)}>
              {project.name}
            </option>
          ))}
        </Select>
      </FormControl>
      <Box>
        <Text fontSize="sm" color={subtleText}>
          Duracion del proyecto
        </Text>
        <Text fontWeight="semibold">{durationLabel}</Text>
      </Box>
      <HStack spacing={2}>
        <Button
          size="sm"
          colorScheme="green"
          onClick={() => onAddBudgetMilestone(budgetMilestonesCount + 1)}
          isDisabled={!selectedBudgetProjectId}
        >
          + Hito
        </Button>
        <Button
          size="sm"
          colorScheme={budgetsEditMode ? "orange" : "blue"}
          onClick={onToggleEditMode}
          isDisabled={!selectedBudgetProjectId || !canEditBudgets}
        >
          {budgetsEditMode ? "Cerrar edicion" : "Editar tabla"}
        </Button>
        {budgetsEditMode && (
          <Button
            size="sm"
            colorScheme="green"
            onClick={onSaveTable}
            isDisabled={!hasBudgetDrafts || savingBudgets}
            isLoading={savingBudgets}
          >
            Guardar tabla
          </Button>
        )}
        {!hasRealBudgets && (
          <Button
            size="sm"
            colorScheme="purple"
            onClick={onSeedTemplate}
            isDisabled={!selectedBudgetProjectId || seedingTemplate}
            isLoading={seedingTemplate}
          >
            Crear plantilla en proyecto
          </Button>
        )}
      </HStack>
    </Flex>

    {!selectedBudgetProjectId ? (
      <Text fontSize="sm" color={subtleText}>
        Selecciona un proyecto para ver sus presupuestos.
      </Text>
    ) : budgetsQueryState.isFetching ? (
      <Text fontSize="sm" color={subtleText}>
        Cargando presupuestos...
      </Text>
    ) : budgetsQueryState.isError ? (
      <Text fontSize="sm" color="red.500">
        No se pudieron cargar los presupuestos.
      </Text>
    ) : (
      <Box borderWidth="1px" borderRadius="xl" overflow="hidden">
        <Box overflowX="auto">
          <Table size="sm" variant="simple" minW="960px">
            <Thead>
              <Tr bg="#0a3d2a">
                <Th
                  rowSpan={2}
                  className="text-sm"
                  color="white"
                  fontWeight="bold"
                >
                  CONCEPTO
                </Th>
                <Th
                  colSpan={2}
                  className="text-sm"
                  textAlign="center"
                  color="white"
                  fontWeight="bold"
                >
                  HITO 1
                </Th>
                <Th
                  colSpan={2}
                  className="text-sm"
                  textAlign="center"
                  color="white"
                  fontWeight="bold"
                >
                  HITO 2
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  color="white"
                  fontWeight="bold"
                >
                  PRES. APROBADO
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  color="white"
                  fontWeight="bold"
                >
                  % GASTO
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  color="white"
                  fontWeight="bold"
                >
                  GASTO PREVISTO
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  color="white"
                  fontWeight="bold"
                >
                  ACCIONES
                </Th>
              </Tr>
              <Tr bg="#0f5d3f">
                <Th className="text-sm" color="white" fontWeight="semibold">
                  APROBADO
                </Th>
                <Th className="text-sm" color="white" fontWeight="semibold">
                  JUSTIFICADO
                </Th>
                <Th className="text-sm" color="white" fontWeight="semibold">
                  APROBADO
                </Th>
                <Th className="text-sm" color="white" fontWeight="semibold">
                  JUSTIFICADO
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {displayBudgetRows.length === 0 ? (
                <Tr>
                  <Td
                    colSpan={budgetMilestonesCount * 2 + 4 || 9}
                    textAlign="center"
                    py={10}
                    color="gray.500"
                  >
                    Aun no hay presupuestos guardados para este proyecto.
                  </Td>
                </Tr>
              ) : (
                groupedBudgetRows.map((budget) => {
                  const h1 = Number(budget.hito1_budget ?? 0);
                  const h2 = Number(budget.hito2_budget ?? 0);
                  const approved = h1 + h2;
                  const forecast = Number(budget.forecasted_spent ?? 0);
                  const percentSpent =
                    approved > 0 ? (forecast / approved) * 100 : 0;
                  const draftConcept =
                    (budgetDrafts[budget.id]?.concept as string) ??
                    budget.concept ??
                    "";
                  const isGeneralExpenses =
                    isGeneralExpensesConcept(draftConcept);
                  const isExternalCollab =
                    isExternalCollaborationConcept(draftConcept);
                  const generalPercent =
                    parsePercentFromConcept(draftConcept) ??
                    DEFAULT_GENERAL_EXPENSES_PERCENT;
                  const externalCollabDetails =
                    parseExternalCollaborationDetails(draftConcept);
                  const externalCollabName = externalCollabDetails?.name ?? "";
                  const externalCollabType = externalCollabDetails?.type ?? "";
                  const resolvedExternalType =
                    externalCollabType ||
                    (externalCollabName
                      ? externalCollaborations.find(
                          (item) => item.name === externalCollabName,
                        )?.collaboration_type ?? ""
                      : "");
                  const generalMode =
                    generalExpensesMode[budget.id] ??
                    (draftConcept.toLowerCase().includes("(importe)")
                      ? "amount"
                      : "percent");
                  const canEditRow = hasRealBudgets && budgetsEditMode;
                  const baseKey = getBudgetParentKey(budget.concept || "");
                  let rowBg = CATEGORY_COLOR_MAP[baseKey] ?? undefined;
                  const isParentRow =
                    isAllCapsConcept(budget.concept) &&
                    budgetParentMap[baseKey] !== undefined &&
                    !(isExternalCollab && externalCollabName);
                  const parentTotals = isParentRow
                    ? budgetParentTotals.get(baseKey)
                    : undefined;
                  const isExternalParent =
                    isExternalCollab && isParentRow && !externalCollabName;
                  const isExternalChild = isExternalCollab && !isExternalParent;
                  if (isParentRow && !rowBg) {
                    rowBg = "#e6f7e6";
                  }
                  return (
                    <Tr key={budget.id} className="even:bg-gray-50" bg={rowBg}>
                      <Td>
                        {isGeneralExpenses ? (
                          canEditRow ? (
                            <HStack spacing={2} align="center">
                              <Text fontWeight="semibold">
                                {GENERAL_EXPENSES_LABEL}
                              </Text>
                              <Select
                                size="sm"
                                maxW="120px"
                                value={generalMode}
                                onChange={(e) =>
                                  onGeneralExpensesModeChange(
                                    budget.id,
                                    e.target.value as "percent" | "amount",
                                  )
                                }
                              >
                                <option value="percent">%</option>
                                <option value="amount">Importe</option>
                              </Select>
                              {generalMode === "percent" ? (
                                <InputGroup size="sm" maxW="120px">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9.,]*"
                                    defaultValue={formatPercentLabelValue(
                                      generalPercent,
                                    )}
                                    onBlur={(e) =>
                                      onGeneralExpensesPercent(
                                        budget.id,
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const target =
                                          e.target as HTMLInputElement;
                                        onGeneralExpensesPercent(
                                          budget.id,
                                          target.value,
                                        );
                                      }
                                    }}
                                  />
                                  <InputRightAddon>%</InputRightAddon>
                                </InputGroup>
                              ) : (
                                <InputGroup size="sm" maxW="140px">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9.,]*"
                                    defaultValue={formatEuroValue(
                                      budgetDrafts[budget.id]
                                        ?.approved_budget ?? approved,
                                    )}
                                    onBlur={(e) =>
                                      onGeneralExpensesAmount(
                                        budget.id,
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const target =
                                          e.target as HTMLInputElement;
                                        onGeneralExpensesAmount(
                                          budget.id,
                                          target.value,
                                        );
                                      }
                                    }}
                                  />
                                  <InputRightAddon>€</InputRightAddon>
                                </InputGroup>
                              )}
                            </HStack>
                          ) : (
                            <Text fontWeight="semibold">
                              {draftConcept ||
                                formatGeneralExpensesConcept(generalPercent)}
                            </Text>
                          )
                        ) : isExternalCollab ? (
                          canEditRow ? (
                            isExternalParent ? (
                              <HStack spacing={2} align="center">
                                <Text fontWeight="semibold">
                                  {EXTERNAL_COLLAB_LABEL}
                                </Text>
                                <>
                                  <Select
                                    size="sm"
                                    maxW="240px"
                                    value={externalCollabSelections[budget.id] ?? ""}
                                    onChange={(e) =>
                                      onExternalCollabSelectionChange(
                                        budget.id,
                                        e.target.value,
                                      )
                                    }
                                    isDisabled={isExternalCollaborationsLoading}
                                  >
                                    <option value="">
                                      {externalCollabSelectPlaceholder}
                                    </option>
                                    {externalCollaborations.map((item) => (
                                      <option
                                        key={item.id}
                                        value={`${item.collaboration_type}::${item.name}`}
                                      >
                                        {`${item.collaboration_type} - ${item.name}`}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button
                                    size="xs"
                                    colorScheme="green"
                                    onClick={() =>
                                      onAddExternalCollaborationRow(budget.id)
                                    }
                                    isDisabled={
                                      !externalCollabSelections[budget.id]
                                    }
                                  >
                                    +
                                  </Button>
                                </>
                              </HStack>
                            ) : (
                              <Text fontWeight="semibold">
                                {resolvedExternalType
                                  ? `${resolvedExternalType} - ${externalCollabName}`
                                  : externalCollabName || draftConcept}
                              </Text>
                            )
                          ) : (
                            <Text fontWeight="semibold">
                              {resolvedExternalType
                                ? `${resolvedExternalType} - ${externalCollabName}`
                                : externalCollabName ||
                                  draftConcept ||
                                  EXTERNAL_COLLAB_LABEL}
                            </Text>
                          )
                        ) : (
                          <Editable
                            submitOnBlur
                            selectAllOnFocus
                            key={`concept-${budget.id}-${draftConcept}`}
                            defaultValue={draftConcept}
                            isDisabled={!budgetsEditMode}
                            onSubmit={(value) =>
                              onBudgetCellSave(budget.id, "concept", value)
                            }
                          >
                            <EditablePreview fontWeight="semibold" />
                            <EditableInput />
                          </Editable>
                        )}
                      </Td>
                      <Td textAlign="right">
                        <BudgetNumberCell
                          value={
                            budgetDrafts[budget.id]?.hito1_budget ??
                            budget.hito1_budget ??
                            0
                          }
                          isEditing={canEditRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "hito1_budget", value)
                          }
                        />
                      </Td>
                      <Td textAlign="right">
                        <BudgetNumberCell
                          value={
                            isParentRow
                              ? (parentTotals?.j1 ?? 0)
                              : (budgetDrafts[budget.id]?.justified_hito1 ??
                                budget.justified_hito1 ??
                                0)
                          }
                          isEditing={canEditRow && !isParentRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "justified_hito1", value)
                          }
                        />
                      </Td>
                      <Td textAlign="right">
                        <BudgetNumberCell
                          value={
                            budgetDrafts[budget.id]?.hito2_budget ??
                            budget.hito2_budget ??
                            0
                          }
                          isEditing={canEditRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "hito2_budget", value)
                          }
                        />
                      </Td>
                      <Td textAlign="right">
                        <BudgetNumberCell
                          value={
                            isParentRow
                              ? (parentTotals?.j2 ?? 0)
                              : (budgetDrafts[budget.id]?.justified_hito2 ??
                                budget.justified_hito2 ??
                                0)
                          }
                          isEditing={canEditRow && !isParentRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "justified_hito2", value)
                          }
                        />
                      </Td>
                      <Td textAlign="right">
                        <BudgetNumberCell
                          value={
                            budgetDrafts[budget.id]?.approved_budget ?? approved
                          }
                          isEditing={canEditRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "approved_budget", value)
                          }
                        />
                      </Td>
                      <Td textAlign="right">
                        <Text fontFamily="mono">
                          {formatPercent(percentSpent)}
                        </Text>
                      </Td>
                      <Td textAlign="right">
                        <BudgetNumberCell
                          value={
                            budgetDrafts[budget.id]?.forecasted_spent ??
                            budget.forecasted_spent ??
                            0
                          }
                          isEditing={canEditRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "forecasted_spent", value)
                          }
                        />
                      </Td>
                      <Td>
                        {hasRealBudgets ? (
                          <Flex gap={2} flexWrap="wrap">
                            <Button
                              size="xs"
                              variant="outline"
                              isDisabled={!budgetsEditMode}
                              onClick={() => onOpenBudgetModal("edit", budget)}
                            >
                              Editar
                            </Button>
                            {isExternalChild && (
                              <Button
                                size="xs"
                                colorScheme="red"
                                variant="outline"
                                isDisabled={!budgetsEditMode}
                                onClick={() =>
                                  onRemoveExternalCollaborationRow(budget)
                                }
                              >
                                Eliminar
                              </Button>
                            )}
                          </Flex>
                        ) : (
                          <Text fontSize="xs" color="gray.500">
                            Anade presupuestos para editarlos aqui.
                          </Text>
                        )}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
            <Tfoot>
              <Tr bg="rgba(196,116,255,0.15)" fontWeight="semibold">
                <Td>Total</Td>
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.hito1} />
                </Td>
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.justificados?.[0] ?? 0} />
                </Td>
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.hito2} />
                </Td>
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.justificados?.[1] ?? 0} />
                </Td>
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.approved} />
                </Td>
                <Td />
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.gasto} />
                </Td>
                <Td />
              </Tr>
              <Tr bg="rgba(196,116,255,0.2)" fontWeight="semibold">
                <Td>Diferencia (por justificar)</Td>
                <Td textAlign="right">
                  <EuroCell value={budgetsDiffH1} />
                </Td>
                <Td />
                <Td textAlign="right">
                  <EuroCell value={budgetsDiffH2} />
                </Td>
                <Td />
                <Td textAlign="right">
                  <EuroCell value={budgetsDiffH1 + budgetsDiffH2} />
                </Td>
                <Td />
                <Td textAlign="right">
                  <EuroCell value={budgetsTabTotals.gasto} />
                </Td>
                <Td />
              </Tr>
            </Tfoot>
          </Table>
        </Box>
      </Box>
    )}
    </Stack>
  );
};
