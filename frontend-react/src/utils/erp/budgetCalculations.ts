import type { ProjectBudgetLine } from "../../api/erpBudgets";
import { CATEGORY_COLOR_MAP } from "./constants";
import {
  getBudgetGroupKey,
  getBudgetSortRank,
  normalizeConceptKey,
} from "./budgetNormalization";

export const calculateBudgetTotals = (rows: ProjectBudgetLine[]) => {
  const totalsByMilestone: Record<number, { amount: number; justified: number }> = {
    1: { amount: 0, justified: 0 },
    2: { amount: 0, justified: 0 },
  };
  let approved = 0;
  let forecasted = 0;
  rows.forEach((row) => {
    const h1 = Number(row.hito1_budget ?? 0);
    const h2 = Number(row.hito2_budget ?? 0);
    const j1 = Number(row.justified_hito1 ?? 0);
    const j2 = Number(row.justified_hito2 ?? 0);
    approved += h1 + h2;
    forecasted += Number(row.forecasted_spent ?? 0);
    totalsByMilestone[1].amount += h1;
    totalsByMilestone[2].amount += h2;
    totalsByMilestone[1].justified += j1;
    totalsByMilestone[2].justified += j2;
  });
  const hito1 = totalsByMilestone[1].amount;
  const hito2 = totalsByMilestone[2].amount;
  const justificados: number[] = [
    totalsByMilestone[1].justified,
    totalsByMilestone[2].justified,
  ];
  const gasto = forecasted;
  return {
    totalsByMilestone,
    approved,
    forecasted,
    hito1,
    hito2,
    justificados,
    gasto,
  };
};

export const calculateParentTotals = (
  rows: ProjectBudgetLine[],
  parentMap: Record<string, string[]>,
) => {
  const totals = new Map<string, { j1: number; j2: number }>();
  Object.entries(parentMap).forEach(([parentKey, children]) => {
    let j1 = 0;
    let j2 = 0;
    rows.forEach((row) => {
      const rowKey = normalizeConceptKey(row.concept);
      if (!children.includes(rowKey)) return;
      j1 += Number(row.justified_hito1 ?? 0);
      j2 += Number(row.justified_hito2 ?? 0);
    });
    totals.set(parentKey, { j1, j2 });
  });
  return totals;
};

export const groupBudgetsByConcept = (rows: ProjectBudgetLine[]) => {
  const map = new Map<string, ProjectBudgetLine>();
  rows.forEach((row) => {
    const key = getBudgetGroupKey(row.concept || `row-${row.id}`);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row });
      return;
    }
    const h1 = Number(current.hito1_budget ?? 0) + Number(row.hito1_budget ?? 0);
    const h2 = Number(current.hito2_budget ?? 0) + Number(row.hito2_budget ?? 0);
    const j1 =
      Number(current.justified_hito1 ?? 0) + Number(row.justified_hito1 ?? 0);
    const j2 =
      Number(current.justified_hito2 ?? 0) + Number(row.justified_hito2 ?? 0);
    const forecast =
      Number(current.forecasted_spent ?? 0) + Number(row.forecasted_spent ?? 0);
    const approved = h1 + h2;
    const percent =
      approved > 0 ? Number(((forecast / approved) * 100).toFixed(2)) : 0;
    map.set(key, {
      ...current,
      hito1_budget: h1,
      hito2_budget: h2,
      justified_hito1: j1,
      justified_hito2: j2,
      approved_budget: approved,
      forecasted_spent: forecast,
      percent_spent: percent,
    });
  });
  const ordered = Array.from(map.values());
  ordered.sort((a, b) => {
    const aRank = getBudgetSortRank(a.concept);
    const bRank = getBudgetSortRank(b.concept);
    if (aRank !== bRank) return aRank - bRank;
    const aKey = normalizeConceptKey(a.concept);
    const bKey = normalizeConceptKey(b.concept);
    return aKey.localeCompare(bKey);
  });
  return ordered;
};

export const getBudgetRowColor = (conceptKey: string) =>
  CATEGORY_COLOR_MAP[conceptKey] ?? undefined;
