import { useMemo, useState } from 'react';
import { Edit3, Plus, Save, Trash2 } from 'lucide-react';
import type { ApiProject, ApiProjectBudgetLine, ApiProjectBudgetMilestone } from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useBudgetEditor } from '@/hooks/useBudgetEditor';
import {
  DEFAULT_GENERAL_EXPENSES_PERCENT,
  EXTERNAL_COLLAB_LABEL,
  formatEuroValue,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  normalizeConceptKey,
  parseEuroInput,
  parsePercentFromConcept,
  safeNumber,
} from '@/utils/erpBudget';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErpBudgetModal } from '@/components/api/ErpBudgetModal';

type ErpBudgetManagerProps = {
  projects: ApiProject[];
  selectedProjectId: number | null;
  onSelectedProjectIdChange: (projectId: number | null) => void;
};

type EditableMoneyCellProps = {
  value: number;
  editable: boolean;
  /** Required when editable=true */
  onSubmit?: (value: string) => void;
};

function EditableMoneyCell({ value, editable, onSubmit }: EditableMoneyCellProps) {
  if (!editable || !onSubmit) {
    return <span className="font-mono text-base">{formatEuroValue(value)}</span>;
  }

  return (
    <Input
      className="h-9 min-w-[100px] text-center font-mono text-base"
      defaultValue={value.toLocaleString('es-ES')}
      onBlur={(event) => onSubmit(String(parseEuroInput(event.target.value)))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        onSubmit(String(parseEuroInput((event.target as HTMLInputElement).value)));
      }}
    />
  );
}

export function ErpBudgetManager({
  projects,
  selectedProjectId,
  onSelectedProjectIdChange,
}: ErpBudgetManagerProps) {
  const { user } = useAuth();
  const { isAdmin, isSiteManager, isMaster } = useUserPermissions();
  const canManage = Boolean(user?.is_super_admin) || isMaster || isAdmin || isSiteManager;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [milestoneToRemove, setMilestoneToRemove] = useState('');
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const budgetEditor = useBudgetEditor({
    projectId: selectedProjectId,
    tenantId: user?.tenant_id ?? undefined,
    canManage,
  });

  const selectedProject = budgetEditor.project;
  const fallbackDurationMonths = useMemo(() => {
    if (!selectedProject?.start_date || !selectedProject?.end_date) return null;
    const start = new Date(selectedProject.start_date);
    const end = new Date(selectedProject.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return Math.max(1, Math.ceil(totalDays / 30));
  }, [selectedProject?.end_date, selectedProject?.start_date]);

  const durationMonths = selectedProject?.duration_months ?? fallbackDurationMonths ?? null;
  const subsidyPercent = selectedProject?.subsidy_percent ?? 0;
  const durationLabel = durationMonths != null ? `${durationMonths} meses` : 'Sin fechas';
  const projectDateRange = useMemo(() => {
    if (!selectedProject?.start_date || !selectedProject?.end_date) return null;
    const start = new Date(selectedProject.start_date);
    const end = new Date(selectedProject.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    return { start, end };
  }, [selectedProject?.end_date, selectedProject?.start_date]);

  const yearOptions = useMemo(() => {
    if (!projectDateRange) return [];
    const options: number[] = [];
    for (let year = projectDateRange.start.getFullYear(); year <= projectDateRange.end.getFullYear(); year += 1) {
      options.push(year);
    }
    return options;
  }, [projectDateRange]);

  const resolvedSelectedYear = useMemo(() => {
    if (!yearOptions.length) return null;
    if (selectedYear && yearOptions.includes(selectedYear)) return selectedYear;
    const currentYear = new Date().getFullYear();
    if (yearOptions.includes(currentYear)) return currentYear;
    return yearOptions[0];
  }, [selectedYear, yearOptions]);

  const resolveActiveMonthsInYear = (start: Date, end: Date, year: number) => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const effectiveStart = start > yearStart ? start : yearStart;
    const effectiveEnd = end < yearEnd ? end : yearEnd;
    if (effectiveEnd < effectiveStart) return 0;
    return (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 + (effectiveEnd.getMonth() - effectiveStart.getMonth()) + 1;
  };

  const monthsActivePerYear =
    projectDateRange && resolvedSelectedYear != null
      ? resolveActiveMonthsInYear(projectDateRange.start, projectDateRange.end, resolvedSelectedYear)
      : 0;

  const milestonesToRender = useMemo<ApiProjectBudgetMilestone[]>(
    () =>
      budgetEditor.budgetMilestones.length > 0
        ? [...budgetEditor.budgetMilestones].sort((a, b) => a.order_index - b.order_index)
        : [
            { id: -1, project_id: selectedProjectId ?? 0, name: 'HITO 1', order_index: 1, created_at: new Date().toISOString() },
            { id: -2, project_id: selectedProjectId ?? 0, name: 'HITO 2', order_index: 2, created_at: new Date().toISOString() },
          ],
    [budgetEditor.budgetMilestones, selectedProjectId]
  );

  const removableMilestones = budgetEditor.budgetMilestones.filter((milestone) => milestone.id > 0);

  const resolveMilestoneValue = (row: ApiProjectBudgetLine, milestoneId: number, index: number, field: 'amount' | 'justified') => {
    const draftMilestone = budgetEditor.budgetDrafts[row.id]?.milestones?.find((m) => m.milestone_id === milestoneId);
    if (draftMilestone) return field === 'amount' ? safeNumber(draftMilestone.amount) : safeNumber(draftMilestone.justified);
    const storedMilestone = row.milestones?.find((m) => m.milestone_id === milestoneId);
    if (storedMilestone) return field === 'amount' ? safeNumber(storedMilestone.amount) : safeNumber(storedMilestone.justified);
    if (index === 0) return field === 'amount' ? safeNumber(row.hito1_budget) : safeNumber(row.justified_hito1);
    if (index === 1) return field === 'amount' ? safeNumber(row.hito2_budget) : safeNumber(row.justified_hito2);
    return 0;
  };

  const { childToParentKey, parentMilestoneTotals, budgetTableTotals } = useMemo(() => {
    const parentMap = budgetEditor.budgetParentMap;
    const rows = budgetEditor.groupedBudgetRows;
    const milestoneCount = milestonesToRender.length;

    // Step 1: invert parent map (child key → parent key)
    const childToParent: Record<string, string> = {};
    for (const [parentKey, children] of Object.entries(parentMap)) {
      for (const child of children) childToParent[child] = parentKey;
    }

    // Step 2: accumulate per-parent milestone totals from child rows
    const parentTotals: Record<string, { amount: number[]; justified: number[] }> = {};
    for (const row of rows) {
      const rowKey = normalizeConceptKey(row.concept);
      const parentKey = childToParent[rowKey];
      if (!parentKey) continue;
      if (!parentTotals[parentKey]) {
        parentTotals[parentKey] = { amount: Array(milestoneCount).fill(0), justified: Array(milestoneCount).fill(0) };
      }
      milestonesToRender.forEach((milestone, index) => {
        parentTotals[parentKey].amount[index] += resolveMilestoneValue(row, milestone.id, index, 'amount');
        parentTotals[parentKey].justified[index] += resolveMilestoneValue(row, milestone.id, index, 'justified');
      });
    }

    // Step 3: aggregate footer totals (parent rows + general expenses)
    const parentKeys = new Set(Object.keys(parentMap));
    const totalsByMilestone = milestonesToRender.map(() => ({ amount: 0, justified: 0 }));
    let totalApproved = 0;
    let totalForecasted = 0;

    for (const row of rows) {
      const rowKey = normalizeConceptKey(row.concept);
      const isParentRow = parentKeys.has(rowKey) && isAllCapsConcept(row.concept);
      const isGenExp = isGeneralExpensesConcept(row.concept);
      if (!isParentRow && !isGenExp) continue;

      let rowApproved = 0;
      milestonesToRender.forEach((milestone, index) => {
        const useParent = isParentRow && !isGenExp && parentTotals[rowKey];
        const amount = useParent ? parentTotals[rowKey].amount[index] : resolveMilestoneValue(row, milestone.id, index, 'amount');
        const justified = useParent ? parentTotals[rowKey].justified[index] : resolveMilestoneValue(row, milestone.id, index, 'justified');
        totalsByMilestone[index].amount += amount;
        totalsByMilestone[index].justified += justified;
        rowApproved += amount;
      });
      totalApproved += rowApproved;
      totalForecasted += safeNumber(row.forecasted_spent);
    }

    return {
      childToParentKey: childToParent,
      parentMilestoneTotals: parentTotals,
      budgetTableTotals: {
        totalsByMilestone,
        totalApproved,
        totalForecasted,
        totalJustified: totalsByMilestone.reduce((sum, t) => sum + t.justified, 0),
      },
    };
  }, [budgetEditor.budgetParentMap, budgetEditor.groupedBudgetRows, budgetEditor.budgetDrafts, milestonesToRender]);

  const baseResult = (budgetTableTotals.totalApproved * subsidyPercent) / 100 - budgetTableTotals.totalForecasted;
  const annualizedResult =
    durationMonths != null && durationMonths > 0 ? (baseResult / durationMonths) * monthsActivePerYear : 0;
  const lightActionButtonClass = 'app-btn-soft h-10 border-sky-300 px-4 text-[15px] font-medium text-sky-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-800';

  return (
    <Card className="bg-white">
      <CardHeader className="space-y-4">
        <div className="flex justify-center">
          <CardTitle className="text-center text-lg font-semibold text-slate-900 sm:text-xl">Presupuestos ERP por obra</CardTitle>
        </div>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-2 sm:min-w-[260px]">
            <Label htmlFor="erp-budget-project" className="text-sm text-muted-foreground">
              Obra
            </Label>
            <select
              id="erp-budget-project"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={selectedProjectId ?? ''}
              onChange={(event) => onSelectedProjectIdChange(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Selecciona una obra</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1 text-sm text-muted-foreground">
            <div className="text-sm font-medium text-slate-700">Resultado: {formatEuroValue(baseResult)} EUR</div>
            <div>Duracion del proyecto: {durationLabel}</div>
            {resolvedSelectedYear != null ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Anualizar:</span>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={resolvedSelectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <span>Meses activos: {monthsActivePerYear}</span>
                <span>Resultado anualizado: {formatEuroValue(annualizedResult)} EUR</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {budgetEditor.budgetsEditMode ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                  <Button size="sm" variant="outline" onClick={() => void budgetEditor.addBudgetMilestone()} disabled={!selectedProjectId || !canManage}>
                    <Plus className="mr-2 h-4 w-4" />
                    Hito
                  </Button>
                  {removableMilestones.length > 0 ? (
                    <>
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={milestoneToRemove}
                        onChange={(event) => setMilestoneToRemove(event.target.value)}
                        disabled={!selectedProjectId || !canManage}
                      >
                        <option value="">Selecciona hito</option>
                        {removableMilestones.map((milestone) => (
                          <option key={milestone.id} value={milestone.id}>
                            {milestone.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        title="Eliminar hito seleccionado"
                        onClick={() => {
                          if (!milestoneToRemove) return;
                          budgetEditor.removeBudgetMilestone(Number(milestoneToRemove));
                          setMilestoneToRemove('');
                        }}
                        disabled={!selectedProjectId || !milestoneToRemove || !canManage}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => budgetEditor.openBudgetModal('create')} disabled={!selectedProjectId || !canManage}>
                    <Plus className="mr-2 h-4 w-4" />
                    Añadir presupuesto
                  </Button>
                </div>
              ) : null}

            </div>

            <Button
              size="sm"
              variant="outline"
              className={lightActionButtonClass}
              onClick={() => budgetEditor.setBudgetsEditMode((prev) => !prev)}
              disabled={!selectedProjectId || !canManage}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              {budgetEditor.budgetsEditMode ? 'Cerrar edicion' : 'Editar tabla'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!selectedProjectId ? (
          <p className="text-sm text-muted-foreground">Selecciona una obra para ver y editar sus presupuestos.</p>
        ) : budgetEditor.budgetsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando presupuestos...</p>
        ) : budgetEditor.budgetsQuery.isError ? (
          <p className="text-sm text-red-600">No se pudieron cargar los presupuestos.</p>
        ) : (
          <>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%] min-w-[220px] text-base">Concepto</TableHead>
                {milestonesToRender.map((milestone) => (
                  <TableHead key={milestone.id} className="min-w-[124px] text-center text-base">
                    <div>{milestone.name}</div>
                    <div className="text-xs font-normal text-muted-foreground">Ppto / Justif.</div>
                  </TableHead>
                ))}
                <TableHead className="min-w-[104px] text-center text-base">Previsto</TableHead>
                <TableHead className="min-w-[56px] text-center text-base">%</TableHead>
                {budgetEditor.budgetsEditMode ? <TableHead className="min-w-[88px] text-right">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {budgetEditor.groupedBudgetRows.map((row) => {
                const key = normalizeConceptKey(row.concept);
                const isParentRow = isAllCapsConcept(row.concept) && budgetEditor.budgetParentMap[key] !== undefined;
                const isGeneralExpensesRow = isGeneralExpensesConcept(row.concept);
                const isExternalParent = normalizeConceptKey(row.concept) === normalizeConceptKey(EXTERNAL_COLLAB_LABEL) && isParentRow;
                const isExternalChild = isExternalCollaborationConcept(row.concept) && !isParentRow;
                const parentMilestones = isParentRow ? parentMilestoneTotals[key] : undefined;
                const rowApproved = milestonesToRender.reduce(
                  (sum, milestone, index) =>
                    sum + (parentMilestones ? parentMilestones.amount[index] : resolveMilestoneValue(row, milestone.id, index, 'amount')),
                  0
                );
                const rowJustified = milestonesToRender.reduce(
                  (sum, milestone, index) =>
                    sum + (parentMilestones ? parentMilestones.justified[index] : resolveMilestoneValue(row, milestone.id, index, 'justified')),
                  0
                );
                const rowPercent = rowApproved > 0 ? (rowJustified / rowApproved) * 100 : 0;
                const currentGeneralMode =
                  budgetEditor.generalExpensesMode[row.id] ??
                  (parsePercentFromConcept(row.concept) != null ? 'percent' : 'amount');

                return (
                  <TableRow key={row.id} className={isParentRow ? 'bg-slate-50 font-semibold' : ''}>
                    <TableCell className="align-top">
                      <div className="space-y-2">
                        {budgetEditor.budgetsEditMode ? (
                          <Input
                            defaultValue={row.concept}
                            className="h-8"
                            onBlur={(event) => budgetEditor.handleBudgetCellSave(row.id, 'concept', event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              budgetEditor.handleBudgetCellSave(row.id, 'concept', (event.target as HTMLInputElement).value);
                            }}
                          />
                        ) : (
                          <div className="break-words text-[15px] leading-snug">{row.concept}</div>
                        )}

                        {budgetEditor.budgetsEditMode && isGeneralExpensesRow ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                              value={currentGeneralMode}
                              onChange={(event) =>
                                budgetEditor.setGeneralExpensesMode((prev) => ({
                                  ...prev,
                                  [row.id]: event.target.value as 'percent' | 'amount',
                                }))
                              }
                            >
                              <option value="percent">Porcentaje</option>
                              <option value="amount">Importe</option>
                            </select>
                            <Input
                              className="h-8 w-[100px]"
                              defaultValue={currentGeneralMode === 'percent' ? String(parsePercentFromConcept(row.concept) ?? DEFAULT_GENERAL_EXPENSES_PERCENT) : String(rowApproved)}
                              onBlur={(event) =>
                                currentGeneralMode === 'percent'
                                  ? budgetEditor.handleGeneralExpensesPercent(row.id, event.target.value)
                                  : budgetEditor.handleGeneralExpensesAmount(row.id, event.target.value)
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>

                    {milestonesToRender.map((milestone, index) => {
                      const amountVal = parentMilestones
                        ? parentMilestones.amount[index]
                        : resolveMilestoneValue(row, milestone.id, index, 'amount');
                      const justifiedVal = parentMilestones
                        ? parentMilestones.justified[index]
                        : resolveMilestoneValue(row, milestone.id, index, 'justified');
                      const canEdit = budgetEditor.budgetsEditMode && !isParentRow;

                      return (
                        <TableCell key={`${row.id}-${milestone.id}`} className="text-center">
                          <div className="space-y-1">
                            <EditableMoneyCell
                              value={amountVal}
                              editable={canEdit}
                              onSubmit={(value) => {
                                if (budgetEditor.budgetMilestones.length > 0 && row.id > 0) {
                                  budgetEditor.handleBudgetMilestoneChange(row, milestone.id, 'amount', value);
                                  return;
                                }
                                budgetEditor.handleBudgetCellSave(row.id, index === 0 ? 'hito1_budget' : 'hito2_budget', value);
                              }}
                            />
                            <div className="text-xs text-muted-foreground">
                              {canEdit ? (
                                <EditableMoneyCell
                                  value={justifiedVal}
                                  editable={true}
                                  onSubmit={(value) => {
                                    if (budgetEditor.budgetMilestones.length > 0 && row.id > 0) {
                                      budgetEditor.handleBudgetMilestoneChange(row, milestone.id, 'justified', value);
                                      return;
                                    }
                                    budgetEditor.handleBudgetCellSave(row.id, index === 0 ? 'justified_hito1' : 'justified_hito2', value);
                                  }}
                                />
                              ) : (
                                <span>Just: {formatEuroValue(justifiedVal)}</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      );
                    })}

                    <TableCell className="text-center">
                      <EditableMoneyCell
                        value={safeNumber(budgetEditor.budgetDrafts[row.id]?.forecasted_spent ?? row.forecasted_spent)}
                        editable={budgetEditor.budgetsEditMode}
                        onSubmit={(value) => budgetEditor.handleBudgetCellSave(row.id, 'forecasted_spent', value)}
                      />
                    </TableCell>
                    <TableCell className="text-center font-mono text-base">{rowPercent.toFixed(1)}%</TableCell>
                    {budgetEditor.budgetsEditMode ? (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => budgetEditor.openBudgetModal('edit', row)} disabled={row.id <= 0}>
                            Editar
                          </Button>

                          {isExternalChild ? (
                            <Button size="sm" variant="outline" onClick={() => budgetEditor.handleRemoveExternalCollaborationRow(row)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                {milestonesToRender.map((_, index) => (
                  <TableCell key={`total-${index}`} className="text-center font-mono text-base">
                    <div>{formatEuroValue(budgetTableTotals.totalsByMilestone[index]?.amount ?? 0)}</div>
                    <div className="text-xs text-muted-foreground">
                      Just: {formatEuroValue(budgetTableTotals.totalsByMilestone[index]?.justified ?? 0)}
                    </div>
                  </TableCell>
                ))}
                <TableCell className="text-center font-mono text-base">{formatEuroValue(budgetTableTotals.totalForecasted)}</TableCell>
                <TableCell className="text-center font-mono text-base">
                  {budgetTableTotals.totalApproved > 0
                    ? ((budgetTableTotals.totalJustified / budgetTableTotals.totalApproved) * 100).toFixed(1)
                    : '0.0'}
                  %
                </TableCell>
                {budgetEditor.budgetsEditMode ? <TableCell /> : null}
              </TableRow>
            </TableFooter>
          </Table>
          {budgetEditor.budgetsEditMode ? (
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <Button
                className="app-btn-primary min-w-[180px]"
                onClick={() => setSaveConfirmOpen(true)}
                disabled={!budgetEditor.hasBudgetDrafts || budgetEditor.savingBudgets || !canManage}
              >
                <Save className="mr-2 h-4 w-4" />
                {budgetEditor.savingBudgets ? 'Guardando...' : 'Guardar tabla'}
              </Button>
            </div>
          ) : null}
          </>
        )}
      </CardContent>

      <ErpBudgetModal
        open={budgetEditor.budgetModalOpen}
        onOpenChange={(open) => (open ? undefined : budgetEditor.closeBudgetModal())}
        onSave={budgetEditor.handleBudgetSave}
        initialValues={budgetEditor.budgetModalInitial}
        title={budgetEditor.budgetModalMode === 'edit' ? 'Editar presupuesto' : 'Agregar presupuesto'}
        submitLabel={budgetEditor.budgetModalMode === 'edit' ? 'Actualizar' : 'Guardar'}
        saving={budgetEditor.isBudgetModalSaving}
        showExternalCollaborationSection={
          budgetEditor.budgetModalMode === 'edit' &&
          normalizeConceptKey(budgetEditor.activeBudgetLine?.concept ?? '') === normalizeConceptKey(EXTERNAL_COLLAB_LABEL)
        }
        externalCollaborationOptions={budgetEditor.externalCollaborations}
        externalCollaborationSelection={
          budgetEditor.activeBudgetLine ? budgetEditor.externalCollabSelections[budgetEditor.activeBudgetLine.id] ?? '' : ''
        }
        onExternalCollaborationSelectionChange={(value) => {
          const activeId = budgetEditor.activeBudgetLine?.id;
          if (!activeId) return;
          budgetEditor.setExternalCollabSelections((prev) => ({
            ...prev,
            [activeId]: value,
          }));
        }}
        onAddExternalCollaboration={() => {
          const activeId = budgetEditor.activeBudgetLine?.id;
          if (!activeId) return;
          budgetEditor.handleAddExternalCollaborationRow(activeId);
        }}
      />
      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea guardar los cambios de esta tabla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se guardarán todas las modificaciones detectadas en los presupuestos y hitos de la tabla actual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void budgetEditor.handleBudgetSaveAll()}
              disabled={!budgetEditor.hasBudgetDrafts || budgetEditor.savingBudgets || !canManage}
            >
              {budgetEditor.savingBudgets ? 'Guardando...' : 'Aceptar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
