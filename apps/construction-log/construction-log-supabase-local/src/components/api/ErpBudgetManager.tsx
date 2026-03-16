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
  parsePercentFromConcept,
} from '@/utils/erpBudget';
import { Button } from '@/components/ui/button';
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

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseInputNumber = (value: string) => {
  const raw = value.trim();
  if (!raw) return '0';
  return raw.replace(/\./g, '').replace(',', '.');
};

function EditableMoneyCell({
  value,
  editable,
  onSubmit,
}: {
  value: number;
  editable: boolean;
  onSubmit?: (value: string) => void;
}) {
  if (!editable || !onSubmit) {
    return <span className="font-mono text-sm">{formatEuroValue(value)}</span>;
  }

  return (
    <Input
      className="h-8 min-w-[92px] text-center font-mono text-sm"
      defaultValue={value.toLocaleString('es-ES')}
      onBlur={(event) => onSubmit(parseInputNumber(event.target.value))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        onSubmit(parseInputNumber((event.target as HTMLInputElement).value));
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

  const milestonesToRender: ApiProjectBudgetMilestone[] =
    budgetEditor.budgetMilestones.length > 0
      ? [...budgetEditor.budgetMilestones].sort((a, b) => a.order_index - b.order_index)
      : [
          { id: -1, project_id: selectedProjectId ?? 0, name: 'HITO 1', order_index: 1, created_at: new Date().toISOString() },
          { id: -2, project_id: selectedProjectId ?? 0, name: 'HITO 2', order_index: 2, created_at: new Date().toISOString() },
        ];

  const removableMilestones = budgetEditor.budgetMilestones.filter((milestone) => milestone.id > 0);

  const resolveMilestoneValue = (
    row: ApiProjectBudgetLine,
    milestoneId: number,
    index: number,
    field: 'amount' | 'justified'
  ) => {
    const draftMilestone = budgetEditor.budgetDrafts[row.id]?.milestones?.find((milestone) => milestone.milestone_id === milestoneId);
    if (draftMilestone) {
      return field === 'amount' ? toNumber(draftMilestone.amount) : toNumber(draftMilestone.justified);
    }
    const storedMilestone = row.milestones?.find((milestone) => milestone.milestone_id === milestoneId);
    if (storedMilestone) {
      return field === 'amount' ? toNumber(storedMilestone.amount) : toNumber(storedMilestone.justified);
    }
    if (index === 0) {
      return field === 'amount' ? toNumber(row.hito1_budget) : toNumber(row.justified_hito1);
    }
    if (index === 1) {
      return field === 'amount' ? toNumber(row.hito2_budget) : toNumber(row.justified_hito2);
    }
    return 0;
  };

  const childToParentKey = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(budgetEditor.budgetParentMap).forEach(([parentKey, children]) => {
      children.forEach((child) => {
        map[child] = parentKey;
      });
    });
    return map;
  }, [budgetEditor.budgetParentMap]);

  const parentMilestoneTotals = useMemo(() => {
    const totals: Record<string, { amount: number[]; justified: number[] }> = {};
    budgetEditor.groupedBudgetRows.forEach((row) => {
      const rowKey = normalizeConceptKey(row.concept);
      const parentKey = childToParentKey[rowKey];
      if (!parentKey) return;
      if (!totals[parentKey]) {
        totals[parentKey] = {
          amount: Array(milestonesToRender.length).fill(0),
          justified: Array(milestonesToRender.length).fill(0),
        };
      }
      milestonesToRender.forEach((milestone, index) => {
        totals[parentKey].amount[index] += resolveMilestoneValue(row, milestone.id, index, 'amount');
        totals[parentKey].justified[index] += resolveMilestoneValue(row, milestone.id, index, 'justified');
      });
    });
    return totals;
  }, [budgetEditor.groupedBudgetRows, childToParentKey, milestonesToRender]);

  const budgetTableTotals = useMemo(() => {
    const parentKeys = new Set(Object.keys(budgetEditor.budgetParentMap));
    const totalsByMilestone = milestonesToRender.map(() => ({ amount: 0, justified: 0 }));
    let totalApproved = 0;
    let totalForecasted = 0;

    budgetEditor.groupedBudgetRows.forEach((row) => {
      const rowKey = normalizeConceptKey(row.concept);
      const isParentBudgetRow = parentKeys.has(rowKey) && isAllCapsConcept(row.concept);
      const isGeneralExpensesRow = isGeneralExpensesConcept(row.concept);
      if (!isParentBudgetRow && !isGeneralExpensesRow) return;

      let rowApproved = 0;
      milestonesToRender.forEach((milestone, index) => {
        const useParentTotals = isParentBudgetRow && !isGeneralExpensesRow && parentMilestoneTotals[rowKey];
        const amountValue = useParentTotals
          ? parentMilestoneTotals[rowKey].amount[index]
          : resolveMilestoneValue(row, milestone.id, index, 'amount');
        const justifiedValue = useParentTotals
          ? parentMilestoneTotals[rowKey].justified[index]
          : resolveMilestoneValue(row, milestone.id, index, 'justified');
        totalsByMilestone[index].amount += amountValue;
        totalsByMilestone[index].justified += justifiedValue;
        rowApproved += amountValue;
      });
      totalApproved += rowApproved;
      totalForecasted += toNumber(row.forecasted_spent);
    });

    return {
      totalsByMilestone,
      totalApproved,
      totalForecasted,
      totalJustified: totalsByMilestone.reduce((sum, item) => sum + item.justified, 0),
    };
  }, [budgetEditor.budgetParentMap, budgetEditor.groupedBudgetRows, milestonesToRender, parentMilestoneTotals]);

  const baseResult = (budgetTableTotals.totalApproved * subsidyPercent) / 100 - budgetTableTotals.totalForecasted;
  const annualizedResult =
    durationMonths != null && durationMonths > 0 ? (baseResult / durationMonths) * monthsActivePerYear : 0;

  return (
    <Card className="bg-white">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-2">
            <CardTitle className="text-base">Presupuestos ERP por obra</CardTitle>
            <div className="grid gap-2 sm:min-w-[260px]">
              <Label htmlFor="erp-budget-project">Obra</Label>
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
          </div>

          <div className="grid gap-1 text-sm text-slate-700">
            <div className="font-semibold">Resultado: {formatEuroValue(baseResult)} EUR</div>
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

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void budgetEditor.addBudgetMilestone()} disabled={!selectedProjectId || !canManage}>
            + Hito
          </Button>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={milestoneToRemove}
            onChange={(event) => setMilestoneToRemove(event.target.value)}
            disabled={!selectedProjectId || removableMilestones.length === 0 || !canManage}
          >
            <option value="">Selecciona hito</option>
            {removableMilestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!milestoneToRemove) return;
              budgetEditor.removeBudgetMilestone(Number(milestoneToRemove));
              setMilestoneToRemove('');
            }}
            disabled={!selectedProjectId || !milestoneToRemove || !canManage}
          >
            Eliminar hito
          </Button>
          <Button
            size="sm"
            variant={budgetEditor.budgetsEditMode ? 'secondary' : 'outline'}
            onClick={() => budgetEditor.setBudgetsEditMode((prev) => !prev)}
            disabled={!selectedProjectId || !canManage}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            {budgetEditor.budgetsEditMode ? 'Cerrar edicion' : 'Editar tabla'}
          </Button>
          <Button
            size="sm"
            onClick={() => void budgetEditor.handleBudgetSaveAll()}
            disabled={!budgetEditor.hasBudgetDrafts || budgetEditor.savingBudgets || !canManage}
          >
            <Save className="mr-2 h-4 w-4" />
            {budgetEditor.savingBudgets ? 'Guardando...' : 'Guardar tabla'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void budgetEditor.seedTemplateBudgetLines()}
            disabled={!selectedProjectId || budgetEditor.seedingTemplate || budgetEditor.hasRealBudgets || !canManage}
          >
            {budgetEditor.seedingTemplate ? 'Creando...' : 'Crear plantilla en proyecto'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => budgetEditor.openBudgetModal('create')} disabled={!selectedProjectId || !canManage}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo presupuesto
          </Button>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">Concepto</TableHead>
                {milestonesToRender.map((milestone) => (
                  <TableHead key={`${milestone.id}-amount`} className="min-w-[120px] text-center">
                    {milestone.name} Ppto
                  </TableHead>
                ))}
                {milestonesToRender.map((milestone) => (
                  <TableHead key={`${milestone.id}-justified`} className="min-w-[120px] text-center">
                    {milestone.name} Just.
                  </TableHead>
                ))}
                <TableHead className="text-center">Aprobado</TableHead>
                <TableHead className="text-center">Previsto</TableHead>
                <TableHead className="text-center">% consumido</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
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
                    <TableCell>
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
                          <div>{row.concept}</div>
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
                              className="h-8 w-[120px]"
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

                    {milestonesToRender.map((milestone, index) => (
                      <TableCell key={`${row.id}-${milestone.id}-amount`} className="text-center">
                        <EditableMoneyCell
                          value={
                            parentMilestones
                              ? parentMilestones.amount[index]
                              : resolveMilestoneValue(row, milestone.id, index, 'amount')
                          }
                          editable={budgetEditor.budgetsEditMode && !isParentRow}
                          onSubmit={(value) => {
                            if (budgetEditor.budgetMilestones.length > 0 && row.id > 0) {
                              budgetEditor.handleBudgetMilestoneChange(row, milestone.id, 'amount', value);
                              return;
                            }
                            const field = index === 0 ? 'hito1_budget' : 'hito2_budget';
                            budgetEditor.handleBudgetCellSave(row.id, field, value);
                          }}
                        />
                      </TableCell>
                    ))}

                    {milestonesToRender.map((milestone, index) => (
                      <TableCell key={`${row.id}-${milestone.id}-justified`} className="text-center">
                        <EditableMoneyCell
                          value={
                            parentMilestones
                              ? parentMilestones.justified[index]
                              : resolveMilestoneValue(row, milestone.id, index, 'justified')
                          }
                          editable={budgetEditor.budgetsEditMode && !isParentRow}
                          onSubmit={(value) => {
                            if (budgetEditor.budgetMilestones.length > 0 && row.id > 0) {
                              budgetEditor.handleBudgetMilestoneChange(row, milestone.id, 'justified', value);
                              return;
                            }
                            const field = index === 0 ? 'justified_hito1' : 'justified_hito2';
                            budgetEditor.handleBudgetCellSave(row.id, field, value);
                          }}
                        />
                      </TableCell>
                    ))}

                    <TableCell className="text-center">
                      <EditableMoneyCell
                        value={rowApproved}
                        editable={budgetEditor.budgetsEditMode}
                        onSubmit={(value) => budgetEditor.handleBudgetCellSave(row.id, 'approved_budget', value)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <EditableMoneyCell
                        value={toNumber(budgetEditor.budgetDrafts[row.id]?.forecasted_spent ?? row.forecasted_spent)}
                        editable={budgetEditor.budgetsEditMode}
                        onSubmit={(value) => budgetEditor.handleBudgetCellSave(row.id, 'forecasted_spent', value)}
                      />
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">{rowPercent.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {budgetEditor.budgetsEditMode ? (
                          <Button size="sm" variant="outline" onClick={() => budgetEditor.openBudgetModal('edit', row)} disabled={row.id <= 0}>
                            Editar
                          </Button>
                        ) : null}

                        {budgetEditor.budgetsEditMode && isExternalParent ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <select
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                              value={budgetEditor.externalCollabSelections[row.id] ?? ''}
                              onChange={(event) =>
                                budgetEditor.setExternalCollabSelections((prev) => ({
                                  ...prev,
                                  [row.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Selecciona colaborador</option>
                              {budgetEditor.externalCollaborations.map((collaboration) => (
                                <option
                                  key={collaboration.id}
                                  value={`${collaboration.collaboration_type}::${collaboration.name}`}
                                >
                                  {collaboration.collaboration_type} - {collaboration.name}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" variant="outline" onClick={() => budgetEditor.handleAddExternalCollaborationRow(row.id)}>
                              Anadir fila
                            </Button>
                          </div>
                        ) : null}

                        {budgetEditor.budgetsEditMode && isExternalChild ? (
                          <Button size="sm" variant="outline" onClick={() => budgetEditor.handleRemoveExternalCollaborationRow(row)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {milestonesToRender.map((_, index) => (
                  <TableCell key={`total-amount-${index}`} className="text-center font-mono">
                    {formatEuroValue(budgetTableTotals.totalsByMilestone[index]?.amount ?? 0)}
                  </TableCell>
                ))}
                {milestonesToRender.map((_, index) => (
                  <TableCell key={`total-justified-${index}`} className="text-center font-mono">
                    {formatEuroValue(budgetTableTotals.totalsByMilestone[index]?.justified ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-center font-mono">{formatEuroValue(budgetTableTotals.totalApproved)}</TableCell>
                <TableCell className="text-center font-mono">{formatEuroValue(budgetTableTotals.totalForecasted)}</TableCell>
                <TableCell className="text-center font-mono">
                  {budgetTableTotals.totalApproved > 0
                    ? ((budgetTableTotals.totalJustified / budgetTableTotals.totalApproved) * 100).toFixed(2)
                    : '0.00'}
                  %
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
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
      />
    </Card>
  );
}
