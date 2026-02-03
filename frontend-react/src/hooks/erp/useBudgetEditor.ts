import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";

import type { ErpMilestone } from "../../api/erpStructure";
import {
  createProjectBudgetLine,
  fetchProjectBudgets,
  updateProjectBudgetLine,
  type ProjectBudgetLine,
  type ProjectBudgetLinePayload,
  type ProjectBudgetLineUpdatePayload,
} from "../../api/erpBudgets";
import {
  DEFAULT_BUDGET_PAYLOAD,
  EXTERNAL_COLLAB_LABEL,
  GENERAL_EXPENSES_AMOUNT_LABEL,
  buildParentChildMap,
  calculateBudgetTotals,
  calculateParentTotals,
  formatExternalCollaborationConcept,
  formatGeneralExpensesConcept,
  getBudgetGroupKey,
  getBudgetMatchKey,
  getBudgetParentKey,
  getDefaultBudgetTemplate,
  groupBudgetsByConcept,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  normalizeConceptKey,
  parseExternalCollaborationDetails,
} from "../../utils/erp";
import { useExternalCollaborations } from "../useExternalCollaborations";
import { useBudgetData } from "./useBudgetData";

type UseBudgetEditorArgs = {
  projectId: number | null;
  projectMilestones: ErpMilestone[];
};

export const useBudgetEditor = ({
  projectId,
  projectMilestones,
  tenantId,
}: UseBudgetEditorArgs & { tenantId?: number }) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const {
    budgetsQuery,
    budgetMilestonesQuery,
    createBudgetMutation,
    updateBudgetMutation,
    deleteBudgetMutation,
    createBudgetMilestoneMutation,
    deleteBudgetMilestoneMutation,
    updateBudgetMilestoneMutation,
  } = useBudgetData(projectId, tenantId);

  const budgetRows = budgetsQuery.data ?? [];
  const budgetMilestones = budgetMilestonesQuery.data ?? [];
  const hasRealBudgets = budgetRows.length > 0;

  const [budgetsEditMode, setBudgetsEditMode] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<
    Record<number, ProjectBudgetLineUpdatePayload>
  >({});
  const [generalExpensesMode, setGeneralExpensesMode] = useState<
    Record<number, "percent" | "amount">
  >({});
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [seedingTemplate, setSeedingTemplate] = useState(false);
  const syncingBudgetMilestonesRef = useRef(false);

  const externalCollaborationsQuery = useExternalCollaborations(tenantId);
  const [extraBudgetRows, setExtraBudgetRows] = useState<ProjectBudgetLine[]>(
    [],
  );
  const [externalCollabSelections, setExternalCollabSelections] = useState<
    Record<number, string>
  >({});
  const tempBudgetIdRef = useRef(-2000);

  const defaultBudgetTemplate = useMemo(() => getDefaultBudgetTemplate(), []);

  const displayBudgetRows = hasRealBudgets ? budgetRows : defaultBudgetTemplate;

  const isSummaryRow = (concept?: string) => {
    const key = normalizeConceptKey(concept ?? "");
    return (
      key === normalizeConceptKey("Total") ||
      key === normalizeConceptKey("Diferencia por justificar")
    );
  };

  const filteredBudgetRows = useMemo(
    () =>
      displayBudgetRows.filter((row) => {
        const concept = row.concept ?? "";
        if (isSummaryRow(concept)) return false;
        return !concept.toLowerCase().includes("cetim");
      }),
    [displayBudgetRows],
  );

  const mergedBudgetRows = useMemo(() => {
    const allRows = hasRealBudgets
      ? [...filteredBudgetRows, ...extraBudgetRows]
      : filteredBudgetRows;
    return allRows.map((row) => {
      const draft = budgetDrafts[row.id];
      const h1 = draft?.hito1_budget ?? Number(row.hito1_budget ?? 0);
      const h2 = draft?.hito2_budget ?? Number(row.hito2_budget ?? 0);
      const approved_budget =
        draft?.approved_budget ?? Number(row.approved_budget ?? h1 + h2);
      const justified_hito1 =
        draft?.justified_hito1 ?? Number(row.justified_hito1 ?? 0);
      const justified_hito2 =
        draft?.justified_hito2 ?? Number(row.justified_hito2 ?? 0);
      const forecasted_spent =
        draft?.forecasted_spent ?? Number(row.forecasted_spent ?? 0);
      const percent_spent =
        approved_budget > 0
          ? Number(((forecasted_spent / approved_budget) * 100).toFixed(2))
          : 0;
      return {
        ...row,
        ...draft,
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget,
        justified_hito1,
        justified_hito2,
        forecasted_spent,
        percent_spent,
        milestones: draft?.milestones ?? row.milestones,
      } as ProjectBudgetLine;
    });
  }, [filteredBudgetRows, budgetDrafts, extraBudgetRows, hasRealBudgets]);

  const groupedBudgetRows = useMemo(() => {
    const baseRows = mergedBudgetRows.filter((row) => !isSummaryRow(row.concept));
    defaultBudgetTemplate.forEach((tpl) => {
      if (isSummaryRow(tpl.concept)) return;
      const tplKey = getBudgetGroupKey(tpl.concept);
      if (!baseRows.some((r) => getBudgetGroupKey(r.concept) === tplKey)) {
        baseRows.push(tpl);
      }
    });
    const hasGeneralExpenses = baseRows.some((row) =>
      isGeneralExpensesConcept(row.concept),
    );
    if (!hasGeneralExpenses) {
      const generalRow = defaultBudgetTemplate.find((row) =>
        isGeneralExpensesConcept(row.concept),
      );
      if (generalRow) baseRows.push(generalRow);
    }
    const hasExternalParent = baseRows.some(
      (row) =>
        isExternalCollaborationConcept(row.concept) &&
        isAllCapsConcept(row.concept),
    );
    if (!hasExternalParent) {
      const externalParent = defaultBudgetTemplate.find(
        (row) =>
          isExternalCollaborationConcept(row.concept) &&
          isAllCapsConcept(row.concept),
      );
      if (externalParent) baseRows.push(externalParent);
    }
    return groupBudgetsByConcept(baseRows);
  }, [mergedBudgetRows, defaultBudgetTemplate]);

  const budgetParentMap = useMemo(() => {
    const base = buildParentChildMap(defaultBudgetTemplate);
    const parentKey = normalizeConceptKey(EXTERNAL_COLLAB_LABEL);
    const externalChildren = base[parentKey] ?? [];
    const extras = mergedBudgetRows
      .map((row) => ({
        concept: row.concept ?? "",
        details: parseExternalCollaborationDetails(row.concept ?? ""),
      }))
      .filter((row) => row.details);
    extras.forEach((row) => {
      const childKey = normalizeConceptKey(row.concept);
      if (!externalChildren.includes(childKey)) {
        externalChildren.push(childKey);
      }
    });
    base[parentKey] = externalChildren;
    return base;
  }, [defaultBudgetTemplate, mergedBudgetRows]);

  const budgetParentTotals = useMemo(() => {
    return calculateParentTotals(mergedBudgetRows, budgetParentMap);
  }, [mergedBudgetRows, budgetParentMap]);

  const generalExpensesBaseTotals = useMemo(() => {
    const totalKey = normalizeConceptKey("Total");
    const diffKey = normalizeConceptKey("Diferencia");
    let h1 = 0;
    let h2 = 0;
    mergedBudgetRows.forEach((row) => {
      const key = getBudgetGroupKey(row.concept);
      if (!key || key === totalKey || key === diffKey) return;
      if (isGeneralExpensesConcept(row.concept)) return;
      const isParentRow = budgetParentMap[key] !== undefined;
      const hasChildren = (budgetParentMap[key] ?? []).length > 0;
      if (isParentRow && hasChildren) return;
      h1 += Number(row.hito1_budget ?? 0);
      h2 += Number(row.hito2_budget ?? 0);
    });
    return { h1, h2 };
  }, [mergedBudgetRows, budgetParentMap]);

  const canEditBudgets = groupedBudgetRows.length > 0;

  const budgetsTabTotals = useMemo(() => {
    return calculateBudgetTotals(groupedBudgetRows, budgetParentMap);
  }, [groupedBudgetRows, budgetParentMap]);

  const budgetsDiffH1 =
    Number(budgetsTabTotals.hito1 || 0) -
    Number(budgetsTabTotals.justificados?.[0] || 0);
  const budgetsDiffH2 =
    Number(budgetsTabTotals.hito2 || 0) -
    Number(budgetsTabTotals.justificados?.[1] || 0);

  useEffect(() => {
    if (!budgetsEditMode) {
      setBudgetDrafts({});
      setExtraBudgetRows([]);
    }
  }, [budgetsEditMode]);

  const seedTemplateBudgetLines = async () => {
    if (!projectId || hasRealBudgets || seedingTemplate) return;
    setSeedingTemplate(true);
    try {
      let currentMilestones = budgetMilestones;
      if (!currentMilestones || currentMilestones.length === 0) {
        const m1 = await createBudgetMilestoneMutation.mutateAsync({
          name: "HITO 1",
          order_index: 1,
        });
        const m2 = await createBudgetMilestoneMutation.mutateAsync({
          name: "HITO 2",
          order_index: 2,
        });
        currentMilestones = [m1, m2];
      }

      for (const row of defaultBudgetTemplate) {
        await createBudgetMutation.mutateAsync({
          concept: row.concept,
          hito1_budget: row.hito1_budget ?? 0,
          justified_hito1: row.justified_hito1 ?? 0,
          hito2_budget: row.hito2_budget ?? 0,
          justified_hito2: row.justified_hito2 ?? 0,
          approved_budget: (row.hito1_budget ?? 0) + (row.hito2_budget ?? 0),
          percent_spent: 0,
          forecasted_spent: 0,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: ["project-budgets", projectId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", projectId],
      });
      toast({ title: "Plantilla creada en el proyecto", status: "success" });
    } catch (err: any) {
      toast({
        title: "No se pudo crear la plantilla",
        description: err?.response?.data?.detail ?? "Revisa el backend.",
        status: "error",
      });
    } finally {
      setSeedingTemplate(false);
    }
  };

  useEffect(() => {
    const syncBudgetMilestones = async () => {
      if (
        !projectId ||
        syncingBudgetMilestonesRef.current ||
        budgetMilestonesQuery.isFetching
      ) {
        return;
      }
      if (projectMilestones.length === 0) return;
      syncingBudgetMilestonesRef.current = true;
      try {
        const orderedProjectMilestones = [...projectMilestones].sort((a, b) => {
          if (a.due_date && b.due_date) {
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          }
          return (a.id ?? 0) - (b.id ?? 0);
        });
        const budgetByOrder = new Map(
          budgetMilestones.map((m) => [m.order_index, m]),
        );

        for (let idx = 0; idx < orderedProjectMilestones.length; idx += 1) {
          const projectMilestone = orderedProjectMilestones[idx];
          const orderIndex = idx + 1;
          const desiredName = projectMilestone.title || `Hito ${orderIndex}`;
          const existing = budgetByOrder.get(orderIndex);
          if (!existing) {
            await createBudgetMilestoneMutation.mutateAsync({
              name: desiredName,
              order_index: orderIndex,
            });
            continue;
          }
          const normalizedExisting = (existing.name || "").trim();
          const normalizedDesired = desiredName.trim();
          if (normalizedExisting !== normalizedDesired) {
            await updateBudgetMilestoneMutation.mutateAsync({
              milestoneId: existing.id,
              payload: { name: desiredName, order_index: orderIndex },
            });
          } else if (existing.order_index !== orderIndex) {
            await updateBudgetMilestoneMutation.mutateAsync({
              milestoneId: existing.id,
              payload: { order_index: orderIndex },
            });
          }
        }

        await queryClient.invalidateQueries({
          queryKey: ["project-budget-milestones", projectId],
        });
      } catch (err: any) {
        toast({
          title: "Error al sincronizar hitos",
          description:
            err?.response?.data?.detail ??
            "No se pudieron sincronizar los hitos del proyecto.",
          status: "error",
        });
      } finally {
        syncingBudgetMilestonesRef.current = false;
      }
    };
    syncBudgetMilestones();
  }, [
    projectId,
    projectMilestones,
    budgetMilestones,
    budgetMilestonesQuery.isFetching,
    createBudgetMilestoneMutation,
    updateBudgetMilestoneMutation,
    deleteBudgetMilestoneMutation,
    queryClient,
    toast,
  ]);

  const handleGeneralExpensesPercent = (budgetId: number, rawValue: string) => {
    if (!projectId) return;
    const normalized = rawValue.trim().replace(/\./g, "").replace(",", ".");
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) return;
    const percent = Math.max(0, numericValue);
    const h1 = Number(
      ((generalExpensesBaseTotals.h1 * percent) / 100).toFixed(2),
    );
    const h2 = Number(
      ((generalExpensesBaseTotals.h2 * percent) / 100).toFixed(2),
    );
    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        concept: formatGeneralExpensesConcept(percent),
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget: h1 + h2,
      },
    }));
  };

  const handleGeneralExpensesAmount = (budgetId: number, rawValue: string) => {
    if (!projectId) return;
    const normalized = rawValue.trim().replace(/\./g, "").replace(",", ".");
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) return;
    const amount = Math.max(0, numericValue);
    const totalBase = generalExpensesBaseTotals.h1 + generalExpensesBaseTotals.h2;
    let h1 = 0;
    let h2 = 0;
    if (totalBase > 0) {
      h1 = Number(((amount * generalExpensesBaseTotals.h1) / totalBase).toFixed(2));
      h2 = Number(((amount * generalExpensesBaseTotals.h2) / totalBase).toFixed(2));
    } else {
      h1 = Number(amount.toFixed(2));
      h2 = 0;
    }
    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        concept: GENERAL_EXPENSES_AMOUNT_LABEL,
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget: h1 + h2,
      },
    }));
  };

  const handleAddExternalCollaborationRow = (budgetId: number) => {
    if (!projectId) return;
    const selection = (externalCollabSelections[budgetId] ?? "").trim();
    if (!selection) return;
    const [type, name] = selection.split("::");
    if (!type || !name) return;
    const tempId = tempBudgetIdRef.current;
    tempBudgetIdRef.current -= 1;
    const concept = formatExternalCollaborationConcept(type.trim(), name.trim());
    const newRow: ProjectBudgetLine = {
      id: tempId,
      project_id: projectId,
      concept,
      hito1_budget: 0,
      justified_hito1: 0,
      hito2_budget: 0,
      justified_hito2: 0,
      approved_budget: 0,
      percent_spent: 0,
      forecasted_spent: 0,
      created_at: new Date().toISOString(),
    };
    setExtraBudgetRows((prev) => [newRow, ...prev]);
    setBudgetDrafts((prev) => ({
      ...prev,
      [tempId]: {
        concept,
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        forecasted_spent: 0,
        percent_spent: 0,
      },
    }));
    setExternalCollabSelections((prev) => ({
      ...prev,
      [budgetId]: "",
    }));
  };

  const handleRemoveExternalCollaborationRow = (row: ProjectBudgetLine) => {
    if (!projectId) return;
    if (row.id < 0) {
      setExtraBudgetRows((prev) => prev.filter((item) => item.id !== row.id));
      setBudgetDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }
    deleteBudgetMutation.mutate(row.id);
  };

  const handleBudgetCellSave = (
    budgetId: number,
    field: keyof ProjectBudgetLineUpdatePayload,
    value: string,
  ) => {
    if (!projectId) return;

    if (field === "concept") {
      const trimmed = value.trim();
      if (!trimmed) return;
      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          concept: trimmed,
        },
      }));
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    const currentRow =
      budgetRows.find((b) => b.id === budgetId) ??
      groupedBudgetRows.find((b) => b.id === budgetId) ??
      defaultBudgetTemplate.find((b) => b.id === budgetId);
    if (!currentRow) return;

    const draft = budgetDrafts[budgetId] ?? {};
    const currentH1 = draft.hito1_budget ?? Number(currentRow.hito1_budget ?? 0);
    const currentH2 = draft.hito2_budget ?? Number(currentRow.hito2_budget ?? 0);

    if (field === "hito1_budget" || field === "hito2_budget") {
      const hito1 = field === "hito1_budget" ? numericValue : currentH1;
      const hito2 = field === "hito2_budget" ? numericValue : currentH2;
      const approvedBudget =
        draft.approved_budget ??
        (Number(
          budgetDrafts[budgetId]?.approved_budget ?? currentRow.approved_budget ?? 0,
        ) ||
          hito1 + hito2);

      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          hito1_budget: hito1,
          hito2_budget: hito2,
          approved_budget: approvedBudget,
        },
      }));
      return;
    }

    if (field === "approved_budget") {
      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          approved_budget: numericValue,
        },
      }));
      return;
    }

    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        [field]: numericValue,
      },
    }));
  };

  const handleBudgetMilestoneChange = (
    budget: ProjectBudgetLine,
    milestoneId: number,
    field: "amount" | "justified",
    value: string,
  ) => {
    if (!projectId || !budgetsEditMode || !budget || budget.id <= 0) return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const current = budgetDrafts[budget.id]?.milestones ?? budget.milestones ?? [];
    const updated = current.map((m) =>
      m.milestone_id === milestoneId ? { ...m, [field]: num } : m,
    );
    if (!current.find((m) => m.milestone_id === milestoneId)) {
      updated.push({
        id: -1,
        milestone_id: milestoneId,
        amount: field === "amount" ? num : 0,
        justified: field === "justified" ? num : 0,
        created_at: new Date().toISOString(),
      } as any);
    }
    setBudgetDrafts((prev) => ({
      ...prev,
      [budget.id]: {
        ...(prev[budget.id] ?? {}),
        milestones: updated.map((m) => ({
          milestone_id: m.milestone_id,
          amount: m.amount,
          justified: m.justified,
        })) as any,
      },
    }));
  };

  const hasBudgetDrafts = Object.keys(budgetDrafts).length > 0;

  const handleBudgetSaveAll = async () => {
    if (!projectId || !hasBudgetDrafts) return;
    try {
      setSavingBudgets(true);
      let latestBudgets = await fetchProjectBudgets(projectId, tenantId);
      const refreshBudgets = async () => {
        latestBudgets = await fetchProjectBudgets(projectId, tenantId);
        return latestBudgets;
      };
      const safeNumber = (value: unknown, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
      };
      const findBudgetByConcept = (concept: string) => {
        const key = getBudgetMatchKey(concept);
        return latestBudgets.find((r) => getBudgetMatchKey(r.concept ?? "") === key);
      };

      const deriveMilestoneValues = (
        draftPayload: ProjectBudgetLineUpdatePayload,
        fallback: ProjectBudgetLine | undefined,
      ) => {
        const milestones = draftPayload.milestones ?? [];
        if (milestones.length === 0) {
          const h1 = safeNumber(draftPayload.hito1_budget ?? fallback?.hito1_budget ?? 0);
          const h2 = safeNumber(draftPayload.hito2_budget ?? fallback?.hito2_budget ?? 0);
          const j1 = safeNumber(draftPayload.justified_hito1 ?? fallback?.justified_hito1 ?? 0);
          const j2 = safeNumber(draftPayload.justified_hito2 ?? fallback?.justified_hito2 ?? 0);
          const approved = safeNumber(
            draftPayload.approved_budget ?? fallback?.approved_budget ?? h1 + h2,
          );
          return {
            hasMilestones: false,
            h1,
            h2,
            j1,
            j2,
            approved,
            milestones,
          };
        }

        const amounts = milestones.map((m) => safeNumber(m.amount ?? 0));
        const justifications = milestones.map((m) => safeNumber(m.justified ?? 0));
        const approved = amounts.reduce((sum, value) => sum + value, 0);
        return {
          hasMilestones: true,
          h1: amounts[0] ?? 0,
          h2: amounts[1] ?? 0,
          j1: justifications[0] ?? 0,
          j2: justifications[1] ?? 0,
          approved,
          milestones,
        };
      };

      for (const [idStr, draftPayload] of Object.entries(budgetDrafts)) {
        const id = Number(idStr);
        const base =
          latestBudgets.find((r) => r.id === id) ??
          mergedBudgetRows.find((r) => r.id === id) ??
          groupedBudgetRows.find((r) => r.id === id) ??
          defaultBudgetTemplate.find((r) => r.id === id);
        if (!base) continue;
        if (!base.concept) {
          throw new Error("Concepto requerido en todas las filas.");
        }
        const baseKey = getBudgetParentKey(base.concept);
        const isParentRow = isAllCapsConcept(base.concept);
        const parentTotals = isParentRow ? budgetParentTotals.get(baseKey) : undefined;
        const milestoneValues = deriveMilestoneValues(draftPayload, base);
        const h1 = milestoneValues.h1;
        const h2 = milestoneValues.h2;
        const approved = milestoneValues.approved;
        const j1 = parentTotals
          ? parentTotals.j1
          : milestoneValues.j1;
        const j2 = parentTotals
          ? parentTotals.j2
          : milestoneValues.j2;
        if (j1 > h1) {
          throw new Error(
            `Justificado H1 mayor que presupuesto en "${base.concept}".`,
          );
        }
        if (j2 > h2) {
          throw new Error(
            `Justificado H2 mayor que presupuesto en "${base.concept}".`,
          );
        }
        const pending = approved - (j1 + j2);
        if (pending < 0) {
          throw new Error(
            `El justificado total supera el presupuesto aprobado en "${base.concept}".`,
          );
        }
      }

      const normalizedDrafts = Object.entries(budgetDrafts).map(
        ([id, draftPayload]) => {
          const numericId = Number(id);
          const conceptValue =
            (
              draftPayload.concept ??
              mergedBudgetRows.find((r) => r.id === numericId)?.concept ??
              ""
            )?.trim() ?? "";
          const matchedByConcept = conceptValue
            ? findBudgetByConcept(conceptValue)
            : undefined;
          const targetId = matchedByConcept?.id ?? -1;
          return { targetId, draftPayload, conceptValue, numericId };
        },
      );

      await Promise.all(
        normalizedDrafts.map(
          async ({ targetId, draftPayload, conceptValue, numericId }) => {
            const baseExisting =
              targetId > 0 ? latestBudgets.find((r) => r.id === targetId) : null;
            const base =
              baseExisting ??
              mergedBudgetRows.find((r) => r.id === numericId) ??
              groupedBudgetRows.find((r) => r.id === numericId) ??
              defaultBudgetTemplate.find((r) => r.id === numericId);
            if (!base) return Promise.resolve();
            if (!conceptValue) return Promise.resolve();
            const milestoneValues = deriveMilestoneValues(draftPayload, base);
            const h1 = milestoneValues.h1;
            const h2 = milestoneValues.h2;
            const approved = milestoneValues.approved;
            const baseKey = getBudgetParentKey(base.concept ?? "");
            const isParentRow = isAllCapsConcept(base.concept);
            const parentTotals = isParentRow ? budgetParentTotals.get(baseKey) : undefined;
            const j1 = parentTotals
              ? parentTotals.j1
              : milestoneValues.j1;
            const j2 = parentTotals
              ? parentTotals.j2
              : milestoneValues.j2;
            const forecast = safeNumber(
              draftPayload.forecasted_spent ?? base.forecasted_spent ?? 0,
            );
            const percent =
              approved > 0 ? safeNumber(((forecast / approved) * 100).toFixed(2), 0) : 0;

            const createPayload: ProjectBudgetLinePayload = {
              concept: conceptValue,
              hito1_budget: h1,
              justified_hito1: j1,
              hito2_budget: h2,
              justified_hito2: j2,
              approved_budget: approved,
              forecasted_spent: forecast,
              percent_spent: percent,
            };

            if (targetId <= 0 || !baseExisting) {
              return createProjectBudgetLine(projectId, createPayload, tenantId);
            }

            const payloadForUpdate: ProjectBudgetLineUpdatePayload = {
              ...draftPayload,
              concept: draftPayload.concept ?? base.concept,
              hito1_budget: h1,
              justified_hito1: j1,
              hito2_budget: h2,
              justified_hito2: j2,
              approved_budget: approved,
              forecasted_spent: forecast,
              percent_spent: percent,
            };

            try {
              return await updateProjectBudgetLine(
                projectId,
                targetId,
                payloadForUpdate,
                tenantId,
              );
            } catch (err: any) {
              if (err?.response?.status === 404) {
                await refreshBudgets();
                const existingByConcept = findBudgetByConcept(createPayload.concept);
                if (existingByConcept && existingByConcept.id !== targetId) {
                  return updateProjectBudgetLine(
                    projectId,
                    existingByConcept.id,
                    payloadForUpdate,
                    tenantId,
                  );
                }
                return createProjectBudgetLine(projectId, createPayload, tenantId);
              }
              throw err;
            }
          },
        ),
      );
      setBudgetDrafts({});
      setExtraBudgetRows([]);
      await queryClient.invalidateQueries({
        queryKey: ["project-budgets", projectId],
      });
      toast({ title: "Presupuestos guardados", status: "success" });
    } catch (error: any) {
      toast({
        title: "Error al guardar presupuestos",
        description:
          error?.message ??
          error?.response?.data?.detail ??
          "No se pudieron guardar los cambios de la tabla.",
        status: "error",
      });
    } finally {
      setSavingBudgets(false);
    }
  };

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetModalMode, setBudgetModalMode] =
    useState<"create" | "edit">("create");
  const [budgetModalInitial, setBudgetModalInitial] =
    useState<ProjectBudgetLinePayload>(DEFAULT_BUDGET_PAYLOAD);
  const [activeBudgetLine, setActiveBudgetLine] =
    useState<ProjectBudgetLine | null>(null);

  const openBudgetModal = (mode: "create" | "edit", line?: ProjectBudgetLine) => {
    setBudgetModalMode(mode);
    if (line) {
      setBudgetModalInitial({
        concept: line.concept,
        hito1_budget: line.hito1_budget,
        justified_hito1: line.justified_hito1,
        hito2_budget: line.hito2_budget,
        justified_hito2: line.justified_hito2,
        approved_budget: line.approved_budget,
        percent_spent: line.percent_spent,
        forecasted_spent: line.forecasted_spent,
      });
      setActiveBudgetLine(line);
    } else {
      setBudgetModalInitial(DEFAULT_BUDGET_PAYLOAD);
      setActiveBudgetLine(null);
    }
    setBudgetModalOpen(true);
  };

  const closeBudgetModal = () => {
    setBudgetModalOpen(false);
  };

  const handleBudgetSave = (payload: ProjectBudgetLinePayload) => {
    if (!payload.concept.trim()) {
      toast({ title: "Concepto requerido", status: "warning" });
      return;
    }
    if (projectId === null) {
      toast({ title: "Selecciona un proyecto", status: "warning" });
      return;
    }
    if (budgetModalMode === "edit" && activeBudgetLine) {
      updateBudgetMutation.mutate(
        {
          budgetId: activeBudgetLine.id,
          payload,
        },
        {
          onSuccess: () => setBudgetModalOpen(false),
        },
      );
      return;
    }
    createBudgetMutation.mutate(payload, {
      onSuccess: () => setBudgetModalOpen(false),
    });
  };

  const ensureBaseBudgetMilestones = async () => {
    if (!projectId) return [] as typeof budgetMilestones;
    if (budgetMilestones.length > 0) return budgetMilestones;
    const created = [];
    const m1 = await createBudgetMilestoneMutation.mutateAsync({
      name: "HITO 1",
      order_index: 1,
    });
    created.push(m1);
    const m2 = await createBudgetMilestoneMutation.mutateAsync({
      name: "HITO 2",
      order_index: 2,
    });
    created.push(m2);
    return created;
  };

  const addBudgetMilestone = async () => {
    if (!projectId) return;
    try {
      const current = await ensureBaseBudgetMilestones();
      const maxIndex = current.reduce(
        (max, milestone) => Math.max(max, milestone.order_index || 0),
        0,
      );
      const nextIndex = maxIndex + 1;
      createBudgetMilestoneMutation.mutate({
        name: `Hito ${nextIndex}`,
        order_index: nextIndex,
      });
    } catch (error: any) {
      toast({
        title: "Error al crear hito",
        description:
          error?.response?.data?.detail ?? "No se pudo crear el hito.",
        status: "error",
      });
    }
  };

  const removeBudgetMilestone = (milestoneId: number) => {
    if (!projectId || !milestoneId) return;
    deleteBudgetMilestoneMutation.mutate(milestoneId, {
      onSuccess: () => {
        setBudgetDrafts((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            const draft = next[Number(key)];
            if (!draft?.milestones) return;
            const filtered = draft.milestones.filter(
              (m) => m.milestone_id !== milestoneId,
            );
            next[Number(key)] = { ...draft, milestones: filtered };
          });
          return next;
        });
      },
    });
  };

  return {
    budgetsEditMode,
    setBudgetsEditMode,
    budgetDrafts,
    generalExpensesMode,
    setGeneralExpensesMode,
    savingBudgets,
    seedingTemplate,
    externalCollaborations: externalCollaborationsQuery.listQuery.data ?? [],
    isExternalCollaborationsLoading: externalCollaborationsQuery.listQuery.isLoading,
    externalCollabSelections,
    setExternalCollabSelections,
    displayBudgetRows,
    groupedBudgetRows,
    budgetParentMap,
    budgetParentTotals,
    budgetsTabTotals,
    budgetsDiffH1,
    budgetsDiffH2,
    canEditBudgets,
    hasRealBudgets,
    hasBudgetDrafts,
    budgetMilestonesCount: budgetMilestones.length,
    budgetMilestones,
    budgetsQueryState: {
      isFetching: budgetsQuery.isFetching,
      isError: budgetsQuery.isError,
    },
    seedTemplateBudgetLines,
    addBudgetMilestone,
    removeBudgetMilestone,
    handleGeneralExpensesPercent,
    handleGeneralExpensesAmount,
    handleAddExternalCollaborationRow,
    handleRemoveExternalCollaborationRow,
    handleBudgetCellSave,
    handleBudgetMilestoneChange,
    handleBudgetSaveAll,
    handleBudgetSave,
    openBudgetModal,
    budgetModalOpen,
    closeBudgetModal,
    budgetModalInitial,
    budgetModalMode,
    isBudgetModalSaving:
      budgetModalMode === "edit"
        ? updateBudgetMutation.isPending
        : createBudgetMutation.isPending,
  };
};
