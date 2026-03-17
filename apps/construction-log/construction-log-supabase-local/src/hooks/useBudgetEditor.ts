import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createProjectBudgetLine,
  deleteProjectBudgetLine,
  getProject,
  listErpMilestones,
  listExternalCollaborations,
  listProjectBudgetMilestones,
  listProjectBudgets,
  type ApiErpMilestone,
  type ApiExternalCollaboration,
  type ApiProject,
  type ApiProjectBudgetLine,
  type ApiProjectBudgetLinePayload,
  type ApiProjectBudgetLineUpdatePayload,
  type ApiProjectBudgetMilestone,
  createProjectBudgetMilestone,
  updateProjectBudgetLine,
  updateProjectBudgetMilestone,
  deleteProjectBudgetMilestone,
} from '@/integrations/api/client';
import {
  DEFAULT_BUDGET_PAYLOAD,
  EXTERNAL_COLLAB_LABEL,
  GENERAL_EXPENSES_AMOUNT_LABEL,
  buildParentChildMap,
  calculateParentTotals,
  formatExternalCollaborationConcept,
  formatGeneralExpensesConcept,
  getBudgetGroupKey,
  getBudgetParentKey,
  getDefaultBudgetTemplate,
  groupBudgetsByConcept,
  isAllCapsConcept,
  isGeneralExpensesConcept,
  isSummaryRow,
  normalizeConceptKey,
  parseExternalCollaborationDetails,
  safeNumber,
} from '@/utils/erpBudget';

type UseBudgetEditorArgs = {
  projectId: number | null;
  tenantId?: string | number | null;
  canManage?: boolean;
};

export function useBudgetEditor({
  projectId,
  tenantId,
  canManage = false,
}: UseBudgetEditorArgs) {
  const queryClient = useQueryClient();
  const defaultBudgetTemplate = useMemo(() => getDefaultBudgetTemplate(), []);
  const resolvedTenantIdRef = useRef<string | number | null | undefined>(tenantId);
  const syncingBudgetMilestonesRef = useRef(false);
  const tempBudgetIdRef = useRef(-2000);

  const [budgetsEditMode, setBudgetsEditMode] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<number, ApiProjectBudgetLineUpdatePayload>>({});
  const [extraBudgetRows, setExtraBudgetRows] = useState<ApiProjectBudgetLine[]>([]);
  const [generalExpensesMode, setGeneralExpensesMode] = useState<Record<number, 'percent' | 'amount'>>({});
  const [externalCollabSelections, setExternalCollabSelections] = useState<Record<number, string>>({});
  const [seedingTemplate, setSeedingTemplate] = useState(false);
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetModalMode, setBudgetModalMode] = useState<'create' | 'edit'>('create');
  const [activeBudgetLine, setActiveBudgetLine] = useState<ApiProjectBudgetLine | null>(null);

  const budgetModalInitial = useMemo<ApiProjectBudgetLinePayload>(() => {
    if (!activeBudgetLine) return DEFAULT_BUDGET_PAYLOAD;
    return {
      concept: activeBudgetLine.concept,
      hito1_budget: safeNumber(activeBudgetLine.hito1_budget),
      justified_hito1: safeNumber(activeBudgetLine.justified_hito1),
      hito2_budget: safeNumber(activeBudgetLine.hito2_budget),
      justified_hito2: safeNumber(activeBudgetLine.justified_hito2),
      approved_budget: safeNumber(activeBudgetLine.approved_budget),
      percent_spent: safeNumber(activeBudgetLine.percent_spent),
      forecasted_spent: safeNumber(activeBudgetLine.forecasted_spent),
    };
  }, [activeBudgetLine]);

  const resolveWriteTenantId = async () => {
    if (tenantId !== undefined) return tenantId;
    if (resolvedTenantIdRef.current !== undefined) return resolvedTenantIdRef.current;
    if (!projectId) return undefined;
    try {
      const project = await getProject(projectId);
      resolvedTenantIdRef.current = project.tenant_id ?? undefined;
      return resolvedTenantIdRef.current;
    } catch {
      return undefined;
    }
  };

  const projectQuery = useQuery<ApiProject>({
    queryKey: ['erp-project-budget-project', projectId, tenantId ?? 'self'],
    queryFn: () => getProject(projectId as number, tenantId),
    enabled: projectId !== null,
  });

  const budgetsQuery = useQuery<ApiProjectBudgetLine[]>({
    queryKey: ['erp-project-budgets', projectId, tenantId ?? 'self'],
    queryFn: () => listProjectBudgets(projectId as number, tenantId),
    enabled: projectId !== null,
  });

  const budgetMilestonesQuery = useQuery<ApiProjectBudgetMilestone[]>({
    queryKey: ['erp-project-budget-milestones', projectId, tenantId ?? 'self'],
    queryFn: () => listProjectBudgetMilestones(projectId as number, tenantId),
    enabled: projectId !== null,
  });

  const projectMilestonesQuery = useQuery<ApiErpMilestone[]>({
    queryKey: ['erp-project-milestones', projectId, tenantId ?? 'self'],
    queryFn: () => listErpMilestones(projectId as number, tenantId),
    enabled: projectId !== null,
  });

  const externalCollaborationsQuery = useQuery<ApiExternalCollaboration[]>({
    queryKey: ['erp-external-collaborations', tenantId ?? 'self'],
    queryFn: () => listExternalCollaborations(tenantId),
  });

  const createBudgetMutation = useMutation({
    mutationFn: async (payload: ApiProjectBudgetLinePayload) => {
      const writeTenantId = await resolveWriteTenantId();
      return createProjectBudgetLine(projectId as number, payload, writeTenantId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budgets', projectId] });
      toast.success('Presupuesto guardado');
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo guardar el presupuesto');
    },
  });

  const updateBudgetMutation = useMutation({
    mutationFn: async ({
      budgetId,
      payload,
    }: {
      budgetId: number;
      payload: ApiProjectBudgetLineUpdatePayload;
    }) => {
      const writeTenantId = await resolveWriteTenantId();
      return updateProjectBudgetLine(projectId as number, budgetId, payload, writeTenantId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budgets', projectId] });
      toast.success('Presupuesto actualizado');
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo actualizar el presupuesto');
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (budgetId: number) => {
      const writeTenantId = await resolveWriteTenantId();
      return deleteProjectBudgetLine(projectId as number, budgetId, writeTenantId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budgets', projectId] });
      toast.success('Presupuesto eliminado');
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo eliminar el presupuesto');
    },
  });

  const createBudgetMilestoneMutation = useMutation({
    mutationFn: async (payload: { name: string; order_index?: number }) => {
      const writeTenantId = await resolveWriteTenantId();
      return createProjectBudgetMilestone(projectId as number, payload, writeTenantId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budget-milestones', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budgets', projectId] });
      toast.success('Hito creado');
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo crear el hito');
    },
  });

  const updateBudgetMilestoneMutation = useMutation({
    mutationFn: async ({
      milestoneId,
      payload,
    }: {
      milestoneId: number;
      payload: { name?: string; order_index?: number };
    }) => {
      const writeTenantId = await resolveWriteTenantId();
      return updateProjectBudgetMilestone(projectId as number, milestoneId, payload, writeTenantId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budget-milestones', projectId] });
      toast.success('Hito actualizado');
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo actualizar el hito');
    },
  });

  const deleteBudgetMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: number) => {
      const writeTenantId = await resolveWriteTenantId();
      return deleteProjectBudgetMilestone(projectId as number, milestoneId, writeTenantId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budget-milestones', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['erp-project-budgets', projectId] });
      toast.success('Hito eliminado');
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo eliminar el hito');
    },
  });

  // Stable refs so the sync useEffect doesn't re-run on mutation state changes
  const createMilestoneRef = useRef(createBudgetMilestoneMutation.mutateAsync);
  const updateMilestoneRef = useRef(updateBudgetMilestoneMutation.mutateAsync);
  createMilestoneRef.current = createBudgetMilestoneMutation.mutateAsync;
  updateMilestoneRef.current = updateBudgetMilestoneMutation.mutateAsync;

  const budgetRows = budgetsQuery.data ?? [];
  const budgetMilestones = budgetMilestonesQuery.data ?? [];
  const projectMilestones = projectMilestonesQuery.data ?? [];
  const hasRealBudgets = budgetRows.length > 0;

  const displayBudgetRows = hasRealBudgets ? budgetRows : defaultBudgetTemplate;

  const filteredBudgetRows = useMemo(
    () => displayBudgetRows.filter((row) => !isSummaryRow(row.concept)),
    [displayBudgetRows]
  );

  const mergedBudgetRows = useMemo(() => {
    const sourceRows = hasRealBudgets ? [...filteredBudgetRows, ...extraBudgetRows] : filteredBudgetRows;
    return sourceRows.map((row) => {
      const draft = budgetDrafts[row.id];
      const h1 = draft?.hito1_budget ?? safeNumber(row.hito1_budget);
      const h2 = draft?.hito2_budget ?? safeNumber(row.hito2_budget);
      const approvedBudget = draft?.approved_budget ?? safeNumber(row.approved_budget, h1 + h2);
      const justifiedH1 = draft?.justified_hito1 ?? safeNumber(row.justified_hito1);
      const justifiedH2 = draft?.justified_hito2 ?? safeNumber(row.justified_hito2);
      const forecastedSpent = draft?.forecasted_spent ?? safeNumber(row.forecasted_spent);
      const percentSpent =
        approvedBudget > 0 ? Number((((justifiedH1 + justifiedH2) / approvedBudget) * 100).toFixed(2)) : 0;

      return {
        ...row,
        ...draft,
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget: approvedBudget,
        justified_hito1: justifiedH1,
        justified_hito2: justifiedH2,
        forecasted_spent: forecastedSpent,
        percent_spent: percentSpent,
        milestones: draft?.milestones ?? row.milestones,
      } as ApiProjectBudgetLine;
    });
  }, [budgetDrafts, extraBudgetRows, filteredBudgetRows, hasRealBudgets]);

  const groupedBudgetRows = useMemo(() => {
    const rows = mergedBudgetRows.filter((row) => !isSummaryRow(row.concept));
    defaultBudgetTemplate.forEach((templateRow) => {
      if (isSummaryRow(templateRow.concept)) return;
      const templateKey = getBudgetGroupKey(templateRow.concept);
      if (!rows.some((row) => getBudgetGroupKey(row.concept) === templateKey)) {
        rows.push(templateRow);
      }
    });
    return groupBudgetsByConcept(rows);
  }, [defaultBudgetTemplate, mergedBudgetRows]);

  const budgetParentMap = useMemo(() => {
    const base = buildParentChildMap(defaultBudgetTemplate);
    const parentKey = normalizeConceptKey(EXTERNAL_COLLAB_LABEL);
    const externalChildren = base[parentKey] ?? [];
    mergedBudgetRows.forEach((row) => {
      const details = parseExternalCollaborationDetails(row.concept);
      if (!details) return;
      const childKey = normalizeConceptKey(row.concept);
      if (!externalChildren.includes(childKey)) {
        externalChildren.push(childKey);
      }
    });
    base[parentKey] = externalChildren;
    return base;
  }, [defaultBudgetTemplate, mergedBudgetRows]);

  const budgetParentTotals = useMemo(
    () => calculateParentTotals(groupedBudgetRows, budgetParentMap),
    [budgetParentMap, groupedBudgetRows]
  );

  const budgetRowsById = useMemo(
    () => new Map(groupedBudgetRows.map((row) => [row.id, row])),
    [groupedBudgetRows]
  );

  const generalExpensesBaseTotals = useMemo(() => {
    const personalKey = normalizeConceptKey('PERSONAL');
    const personalRow = mergedBudgetRows.find((row) => normalizeConceptKey(row.concept) === personalKey);
    if (personalRow) {
      return {
        h1: safeNumber(personalRow.hito1_budget),
        h2: safeNumber(personalRow.hito2_budget),
      };
    }

    let h1 = 0;
    let h2 = 0;
    mergedBudgetRows.forEach((row) => {
      const key = getBudgetGroupKey(row.concept);
      if (!key || isGeneralExpensesConcept(row.concept)) return;
      const isParentRow = budgetParentMap[key] !== undefined;
      const hasChildren = (budgetParentMap[key] ?? []).length > 0;
      if (isParentRow && hasChildren) return;
      h1 += safeNumber(row.hito1_budget);
      h2 += safeNumber(row.hito2_budget);
    });
    return { h1, h2 };
  }, [budgetParentMap, mergedBudgetRows]);

  useEffect(() => {
    if (!budgetsEditMode) {
      setBudgetDrafts({});
      setExtraBudgetRows([]);
    }
  }, [budgetsEditMode]);

  useEffect(() => {
    const syncBudgetMilestones = async () => {
      if (
        !projectId ||
        syncingBudgetMilestonesRef.current ||
        budgetMilestonesQuery.isFetching ||
        projectMilestones.length === 0
      ) {
        return;
      }
      syncingBudgetMilestonesRef.current = true;
      try {
        const orderedProjectMilestones = [...projectMilestones].sort((a, b) => {
          if (a.due_date && b.due_date) {
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          }
          return a.id - b.id;
        });
        const budgetByOrder = new Map(budgetMilestones.map((milestone) => [milestone.order_index, milestone]));
        for (let index = 0; index < orderedProjectMilestones.length; index += 1) {
          const milestone = orderedProjectMilestones[index];
          const orderIndex = index + 1;
          const desiredName = milestone.title || `Hito ${orderIndex}`;
          const existing = budgetByOrder.get(orderIndex);
          if (!existing) {
            await createMilestoneRef.current({ name: desiredName, order_index: orderIndex });
            continue;
          }
          if ((existing.name || '').trim() !== desiredName.trim() || existing.order_index !== orderIndex) {
            await updateMilestoneRef.current({
              milestoneId: existing.id,
              payload: { name: desiredName, order_index: orderIndex },
            });
          }
        }
      } catch (error: any) {
        toast.error(error?.message || error?.response?.data?.detail || 'No se pudieron sincronizar los hitos');
      } finally {
        syncingBudgetMilestonesRef.current = false;
      }
    };
    void syncBudgetMilestones();
  }, [budgetMilestones, budgetMilestonesQuery.isFetching, projectId, projectMilestones]);

  const seedTemplateBudgetLines = async () => {
    if (!projectId || hasRealBudgets || seedingTemplate) return;
    setSeedingTemplate(true);
    try {
      let currentMilestones = budgetMilestones;
      if (currentMilestones.length === 0) {
        const first = await createBudgetMilestoneMutation.mutateAsync({ name: 'HITO 1', order_index: 1 });
        const second = await createBudgetMilestoneMutation.mutateAsync({ name: 'HITO 2', order_index: 2 });
        currentMilestones = [first, second];
      }
      await Promise.all(
        defaultBudgetTemplate.map((row) =>
          createBudgetMutation.mutateAsync({
            concept: row.concept,
            hito1_budget: safeNumber(row.hito1_budget),
            justified_hito1: safeNumber(row.justified_hito1),
            hito2_budget: safeNumber(row.hito2_budget),
            justified_hito2: safeNumber(row.justified_hito2),
            approved_budget: safeNumber(row.hito1_budget) + safeNumber(row.hito2_budget),
            percent_spent: 0,
            forecasted_spent: 0,
          })
        )
      );
      toast.success('Plantilla creada en el proyecto');
    } catch (error: any) {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudo crear la plantilla');
    } finally {
      setSeedingTemplate(false);
    }
  };

  const handleGeneralExpensesPercent = (budgetId: number, rawValue: string) => {
    const numericValue = safeNumber(rawValue.replace(/\./g, '').replace(',', '.'));
    const percent = Math.max(0, numericValue);
    const h1 = Number(((generalExpensesBaseTotals.h1 * percent) / 100).toFixed(2));
    const h2 = Number(((generalExpensesBaseTotals.h2 * percent) / 100).toFixed(2));
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
    const numericValue = safeNumber(rawValue.replace(/\./g, '').replace(',', '.'));
    const amount = Math.max(0, numericValue);
    const totalBase = generalExpensesBaseTotals.h1 + generalExpensesBaseTotals.h2;
    const h1 =
      totalBase > 0 ? Number(((amount * generalExpensesBaseTotals.h1) / totalBase).toFixed(2)) : Number(amount.toFixed(2));
    const h2 = totalBase > 0 ? Number((amount - h1).toFixed(2)) : 0;
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
    const selection = (externalCollabSelections[budgetId] ?? '').trim();
    if (!selection) return;
    const [type, name] = selection.split('::');
    if (!type || !name) return;
    const tempId = tempBudgetIdRef.current;
    tempBudgetIdRef.current -= 1;
    const concept = formatExternalCollaborationConcept(type.trim(), name.trim());
    const newRow: ApiProjectBudgetLine = {
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
      [budgetId]: '',
    }));
  };

  const handleRemoveExternalCollaborationRow = (row: ApiProjectBudgetLine) => {
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
    field: keyof ApiProjectBudgetLineUpdatePayload,
    value: string
  ) => {
    if (field === 'concept') {
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

    const numericValue = safeNumber(value);
    const currentRow = budgetRowsById.get(budgetId);
    if (!currentRow) return;
    const draft = budgetDrafts[budgetId] ?? {};
    const currentH1 = safeNumber(draft.hito1_budget ?? currentRow.hito1_budget);
    const currentH2 = safeNumber(draft.hito2_budget ?? currentRow.hito2_budget);

    if (field === 'hito1_budget' || field === 'hito2_budget') {
      const hito1 = field === 'hito1_budget' ? numericValue : currentH1;
      const hito2 = field === 'hito2_budget' ? numericValue : currentH2;
      const approvedBudget = safeNumber(draft.approved_budget ?? currentRow.approved_budget, hito1 + hito2);
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

    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        [field]: numericValue,
      },
    }));
  };

  const handleBudgetMilestoneChange = (
    budget: ApiProjectBudgetLine,
    milestoneId: number,
    field: 'amount' | 'justified',
    value: string
  ) => {
    if (!budgetsEditMode || !budget || budget.id <= 0) return;
    const numericValue = safeNumber(value);
    const current = budgetDrafts[budget.id]?.milestones ?? budget.milestones ?? [];
    const updated = current.map((milestone) =>
      milestone.milestone_id === milestoneId ? { ...milestone, [field]: numericValue } : milestone
    );
    if (!current.find((milestone) => milestone.milestone_id === milestoneId)) {
      updated.push({
        milestone_id: milestoneId,
        amount: field === 'amount' ? numericValue : 0,
        justified: field === 'justified' ? numericValue : 0,
      });
    }
    setBudgetDrafts((prev) => ({
      ...prev,
      [budget.id]: {
        ...(prev[budget.id] ?? {}),
        milestones: updated,
      },
    }));
  };

  const hasBudgetDrafts = Object.keys(budgetDrafts).length > 0;

  const handleBudgetSaveAll = async () => {
    if (!projectId || !hasBudgetDrafts) return;
    try {
      setSavingBudgets(true);
      const writeTenantId = await resolveWriteTenantId();
      if (writeTenantId === null) {
        throw new Error('Tenant requerido para guardar presupuestos.');
      }

      let latestBudgets = await listProjectBudgets(projectId, writeTenantId);
      const refreshBudgets = async () => {
        latestBudgets = await listProjectBudgets(projectId, writeTenantId);
        return latestBudgets;
      };
      const findBudgetByConcept = (concept: string) => {
        const key = getBudgetGroupKey(concept);
        return latestBudgets.find((row) => getBudgetGroupKey(row.concept ?? '') === key);
      };

      const deriveMilestoneValues = (
        draftPayload: ApiProjectBudgetLineUpdatePayload,
        fallback: ApiProjectBudgetLine | undefined
      ) => {
        const milestones = draftPayload.milestones ?? [];
        if (milestones.length === 0) {
          const h1 = safeNumber(draftPayload.hito1_budget ?? fallback?.hito1_budget);
          const h2 = safeNumber(draftPayload.hito2_budget ?? fallback?.hito2_budget);
          const j1 = safeNumber(draftPayload.justified_hito1 ?? fallback?.justified_hito1);
          const j2 = safeNumber(draftPayload.justified_hito2 ?? fallback?.justified_hito2);
          const approved = safeNumber(draftPayload.approved_budget ?? fallback?.approved_budget, h1 + h2);
          return { h1, h2, j1, j2, approved };
        }
        const amounts = milestones.map((milestone) => safeNumber(milestone.amount));
        const justifications = milestones.map((milestone) => safeNumber(milestone.justified));
        return {
          h1: amounts[0] ?? 0,
          h2: amounts[1] ?? 0,
          j1: justifications[0] ?? 0,
          j2: justifications[1] ?? 0,
          approved: amounts.reduce((sum, value) => sum + value, 0),
        };
      };

      const normalizedDrafts = Object.entries(budgetDrafts).map(([id, draftPayload]) => {
        const numericId = Number(id);
        const conceptValue = (draftPayload.concept ??
          mergedBudgetRows.find((row) => row.id === numericId)?.concept ??
          '') as string;
        const existingById = numericId > 0 ? latestBudgets.find((row) => row.id === numericId) : undefined;
        const matchedByConcept =
          !existingById && conceptValue ? findBudgetByConcept(conceptValue) : undefined;
        return {
          targetId: existingById?.id ?? matchedByConcept?.id ?? -1,
          draftPayload,
          conceptValue: conceptValue.trim(),
          numericId,
          hasExisting: Boolean(existingById || matchedByConcept),
        };
      });

      await Promise.all(
        normalizedDrafts.map(async ({ targetId, draftPayload, conceptValue, numericId, hasExisting }) => {
          const baseExisting = targetId > 0 ? latestBudgets.find((row) => row.id === targetId) : null;
          const base =
            baseExisting ??
            mergedBudgetRows.find((row) => row.id === numericId) ??
            groupedBudgetRows.find((row) => row.id === numericId) ??
            defaultBudgetTemplate.find((row) => row.id === numericId);
          if (!base || !conceptValue) return;

          const milestoneValues = deriveMilestoneValues(draftPayload, base);
          const baseKey = getBudgetParentKey(base.concept ?? '');
          const isParentRow = isAllCapsConcept(base.concept);
          const parentTotals = isParentRow ? budgetParentTotals.get(baseKey) : undefined;
          const approved = milestoneValues.approved;
          const justifiedH1 = parentTotals ? parentTotals.j1 : milestoneValues.j1;
          const justifiedH2 = parentTotals ? parentTotals.j2 : milestoneValues.j2;
          const forecastedSpent = safeNumber(draftPayload.forecasted_spent ?? base.forecasted_spent);
          const percentSpent =
            approved > 0 ? Number((((justifiedH1 + justifiedH2) / approved) * 100).toFixed(2)) : 0;

          const createPayload: ApiProjectBudgetLinePayload = {
            concept: conceptValue,
            hito1_budget: milestoneValues.h1,
            justified_hito1: justifiedH1,
            hito2_budget: milestoneValues.h2,
            justified_hito2: justifiedH2,
            approved_budget: approved,
            forecasted_spent: forecastedSpent,
            percent_spent: percentSpent,
          };

          if (!hasExisting || targetId <= 0 || !baseExisting) {
            await createProjectBudgetLine(projectId, createPayload, writeTenantId);
            return;
          }

          const updatePayload: ApiProjectBudgetLineUpdatePayload = {
            ...draftPayload,
            concept: draftPayload.concept ?? base.concept,
            hito1_budget: milestoneValues.h1,
            justified_hito1: justifiedH1,
            hito2_budget: milestoneValues.h2,
            justified_hito2: justifiedH2,
            approved_budget: approved,
            forecasted_spent: forecastedSpent,
            percent_spent: percentSpent,
          };

          try {
            await updateProjectBudgetLine(projectId, targetId, updatePayload, writeTenantId);
          } catch (error: any) {
            if (error?.status === 404 || error?.response?.status === 404) {
              await refreshBudgets();
              const existingByConcept = findBudgetByConcept(createPayload.concept);
              if (existingByConcept && existingByConcept.id !== targetId) {
                await updateProjectBudgetLine(projectId, existingByConcept.id, updatePayload, writeTenantId);
                return;
              }
              await createProjectBudgetLine(projectId, createPayload, writeTenantId);
              return;
            }
            throw error;
          }
        })
      );

      setBudgetDrafts({});
      setExtraBudgetRows([]);
      await queryClient.invalidateQueries({ queryKey: ['erp-project-budgets', projectId] });
      toast.success('Presupuestos guardados');
    } catch (error: any) {
      toast.error(error?.message || error?.response?.data?.detail || 'No se pudieron guardar los cambios');
    } finally {
      setSavingBudgets(false);
    }
  };

  const openBudgetModal = (mode: 'create' | 'edit', line?: ApiProjectBudgetLine) => {
    setBudgetModalMode(mode);
    setActiveBudgetLine(line ?? null);
    setBudgetModalOpen(true);
  };

  const closeBudgetModal = () => setBudgetModalOpen(false);

  const handleBudgetSave = (payload: ApiProjectBudgetLinePayload) => {
    if (!payload.concept.trim()) {
      toast.warning('Concepto requerido');
      return;
    }
    if (!projectId) {
      toast.warning('Selecciona una obra');
      return;
    }

    if (budgetModalMode === 'edit' && activeBudgetLine) {
      updateBudgetMutation.mutate(
        {
          budgetId: activeBudgetLine.id,
          payload,
        },
        {
          onSuccess: () => {
            setBudgetModalOpen(false);
            setBudgetDrafts((prev) => {
              const next = { ...prev };
              delete next[activeBudgetLine.id];
              return next;
            });
          },
        }
      );
      return;
    }

    createBudgetMutation.mutate(payload, {
      onSuccess: () => setBudgetModalOpen(false),
    });
  };

  const addBudgetMilestone = async () => {
    if (!projectId) return;
    const maxIndex = budgetMilestones.reduce((max, milestone) => Math.max(max, milestone.order_index || 0), 0);
    await createBudgetMilestoneMutation.mutateAsync({
      name: `Hito ${maxIndex + 1}`,
      order_index: maxIndex + 1,
    });
  };

  const removeBudgetMilestone = (milestoneId: number) => {
    if (!projectId || !milestoneId) return;
    deleteBudgetMilestoneMutation.mutate(milestoneId, {
      onSuccess: () => {
        setBudgetDrafts((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            const budgetId = Number(key);
            const draft = next[budgetId];
            if (!draft?.milestones) return;
            next[budgetId] = {
              ...draft,
              milestones: draft.milestones.filter((milestone) => milestone.milestone_id !== milestoneId),
            };
          });
          return next;
        });
      },
    });
  };

  return {
    project: projectQuery.data ?? null,
    activeBudgetLine,
    budgetsQuery,
    budgetMilestonesQuery,
    externalCollaborations: externalCollaborationsQuery.data ?? [],
    isExternalCollaborationsLoading: externalCollaborationsQuery.isLoading,
    budgetMilestones,
    groupedBudgetRows,
    budgetParentMap,
    budgetsEditMode,
    setBudgetsEditMode,
    budgetDrafts,
    generalExpensesMode,
    setGeneralExpensesMode,
    externalCollabSelections,
    setExternalCollabSelections,
    canManage,
    hasRealBudgets,
    hasBudgetDrafts,
    savingBudgets,
    seedingTemplate,
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
    openBudgetModal,
    closeBudgetModal,
    budgetModalOpen,
    budgetModalMode,
    budgetModalInitial,
    handleBudgetSave,
    isBudgetModalSaving:
      budgetModalMode === 'edit' ? updateBudgetMutation.isPending : createBudgetMutation.isPending,
  };
}
