import type { ApiProjectBudgetLine, ApiProjectBudgetLinePayload } from '@/integrations/api/client';

const normalizeKey = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '');

export const safeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const parseEuroInput = (value: string): number => {
  const raw = value.trim().replace(/\s+/g, '');
  if (!raw) return 0;
  const n = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const GENERAL_EXPENSES_LABEL = 'GASTOS GENERALES';
export const EXTERNAL_COLLAB_LABEL = 'COLABORACIONES EXTERNAS';
export const DEFAULT_GENERAL_EXPENSES_PERCENT = 19;
export const GENERAL_EXPENSES_AMOUNT_LABEL = `${GENERAL_EXPENSES_LABEL} (importe)`;

export const CATEGORY_COLOR_MAP: Record<string, string | undefined> = {
  [normalizeKey('Total')]: '#ead7ff',
  [normalizeKey('Diferencia')]: '#f3d9fa',
};

export const BUDGET_ORDER = [
  normalizeKey('EQUIPOS (Amortizacion)'),
  normalizeKey('PERSONAL'),
  normalizeKey('Doctores'),
  normalizeKey('Titulados universitarios'),
  normalizeKey('No titulado'),
  normalizeKey('MATERIAL FUNGIBLE'),
  normalizeKey('Materiales para pruebas y ensayos'),
  normalizeKey('COLABORACIONES EXTERNAS'),
  normalizeKey(GENERAL_EXPENSES_LABEL),
  normalizeKey('OTROS GASTOS'),
  normalizeKey('Auditoria'),
  normalizeKey('Dictamen acreditado ENAC de informe DNSH'),
];

export const DEFAULT_BUDGET_PAYLOAD: ApiProjectBudgetLinePayload = {
  concept: '',
  hito1_budget: 0,
  justified_hito1: 0,
  hito2_budget: 0,
  justified_hito2: 0,
  approved_budget: 0,
  percent_spent: 0,
  forecasted_spent: 0,
};

export const formatEuroValue = (value: number) =>
  new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);

export const formatPercentLabelValue = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export const normalizeConceptKey = (value?: string) => normalizeKey(value || '');

export const isSummaryRow = (concept?: string): boolean => {
  const key = normalizeConceptKey(concept ?? '');
  return key === normalizeConceptKey('Total') || key === normalizeConceptKey('Diferencia por justificar');
};

export const isGeneralExpensesConcept = (value?: string) =>
  normalizeConceptKey(value).startsWith(normalizeConceptKey(GENERAL_EXPENSES_LABEL));

export const isExternalCollaborationConcept = (value?: string) =>
  normalizeConceptKey(value).startsWith(normalizeConceptKey(EXTERNAL_COLLAB_LABEL));

export const isAllCapsConcept = (value?: string) => {
  const text = (value ?? '').trim();
  if (!text) return false;
  return text === text.toUpperCase();
};

export const parsePercentFromConcept = (value?: string) => {
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatGeneralExpensesConcept = (percent: number) =>
  `${GENERAL_EXPENSES_LABEL} (${formatPercentLabelValue(percent)}%)`;

export const formatExternalCollaborationConcept = (type: string, name: string) =>
  `${EXTERNAL_COLLAB_LABEL} - ${type} - ${name}`;

export const parseExternalCollaborationDetails = (value?: string) => {
  if (!value) return null;
  const prefix = `${EXTERNAL_COLLAB_LABEL} - `;
  if (!value.startsWith(prefix)) return null;
  const rest = value.slice(prefix.length).trim();
  const parts = rest.split(' - ');
  if (parts.length === 1) {
    const name = parts[0].trim();
    return name ? { type: '', name } : null;
  }
  const [type, ...nameParts] = parts;
  const name = nameParts.join(' - ').trim();
  if (!type || !name) return null;
  return { type: type.trim(), name };
};

export const getBudgetGroupKey = (value?: string) =>
  isGeneralExpensesConcept(value) ? normalizeConceptKey(GENERAL_EXPENSES_LABEL) : normalizeConceptKey(value);

export const getBudgetParentKey = (value?: string) => {
  if (isGeneralExpensesConcept(value)) return normalizeConceptKey(GENERAL_EXPENSES_LABEL);
  if (isExternalCollaborationConcept(value)) {
    const details = parseExternalCollaborationDetails(value);
    return details ? normalizeConceptKey(value) : normalizeConceptKey(EXTERNAL_COLLAB_LABEL);
  }
  return normalizeConceptKey(value);
};

export const getBudgetSortRank = (value?: string) => {
  const isExternal = isExternalCollaborationConcept(value);
  const key = isExternal
    ? normalizeConceptKey(EXTERNAL_COLLAB_LABEL)
    : isGeneralExpensesConcept(value)
      ? normalizeConceptKey(GENERAL_EXPENSES_LABEL)
      : normalizeConceptKey(value);
  const baseIndex = BUDGET_ORDER.indexOf(key);
  if (isExternal && value && value !== EXTERNAL_COLLAB_LABEL) {
    const childIndex = BUDGET_ORDER.indexOf(normalizeConceptKey('Centros Tecnologicos'));
    return childIndex !== -1 ? childIndex + 0.1 : baseIndex + 0.1;
  }
  return baseIndex !== -1 ? baseIndex : Number.POSITIVE_INFINITY;
};

export const buildParentChildMap = <T extends { concept?: string }>(rows: T[]) => {
  const map: Record<string, string[]> = {};
  let currentParent: string | null = null;

  rows.forEach((row) => {
    const concept = row.concept ?? '';
    const key = getBudgetParentKey(concept);
    if (isAllCapsConcept(concept)) {
      currentParent = key;
      if (!map[currentParent]) map[currentParent] = [];
      return;
    }
    if (currentParent) {
      map[currentParent].push(normalizeConceptKey(concept));
    }
  });

  return map;
};

export const calculateParentTotals = (
  rows: ApiProjectBudgetLine[],
  parentMap: Record<string, string[]>
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

export const calculateBudgetTotals = (
  rows: ApiProjectBudgetLine[],
  parentMap: Record<string, string[]>
) => {
  const totalsByMilestone: Record<number, { amount: number; justified: number }> = {
    1: { amount: 0, justified: 0 },
    2: { amount: 0, justified: 0 },
  };
  let approved = 0;
  let forecasted = 0;

  const parentKeys = new Set(Object.keys(parentMap));
  const parentTotals = calculateParentTotals(rows, parentMap);

  rows.forEach((row) => {
    const rowKey = normalizeConceptKey(row.concept);
    const isParentRow = isAllCapsConcept(row.concept) && parentKeys.has(rowKey);
    const isGeneralExpenses = isGeneralExpensesConcept(row.concept);
    if (!isParentRow && !isGeneralExpenses) return;

    const h1 = Number(row.hito1_budget ?? 0);
    const h2 = Number(row.hito2_budget ?? 0);
    const parentJustified = parentTotals.get(rowKey);
    const useParentTotals = parentJustified && !isGeneralExpenses;
    const j1 = useParentTotals ? parentJustified.j1 : Number(row.justified_hito1 ?? 0);
    const j2 = useParentTotals ? parentJustified.j2 : Number(row.justified_hito2 ?? 0);

    approved += h1 + h2;
    forecasted += Number(row.forecasted_spent ?? 0);
    totalsByMilestone[1].amount += h1;
    totalsByMilestone[2].amount += h2;
    totalsByMilestone[1].justified += j1;
    totalsByMilestone[2].justified += j2;
  });

  return {
    totalsByMilestone,
    approved,
    forecasted,
    hito1: totalsByMilestone[1].amount,
    hito2: totalsByMilestone[2].amount,
    justificados: [totalsByMilestone[1].justified, totalsByMilestone[2].justified],
    gasto: forecasted,
  };
};

export const groupBudgetsByConcept = (rows: ApiProjectBudgetLine[]) => {
  const map = new Map<string, ApiProjectBudgetLine>();

  rows.forEach((row) => {
    const key = getBudgetGroupKey(row.concept || `row-${row.id}`);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row });
      return;
    }
    const currentApproved = Number(current.approved_budget ?? 0);
    const nextApproved = Number(row.approved_budget ?? 0);
    if (nextApproved >= currentApproved) {
      map.set(key, { ...row });
    }
  });

  const ordered = Array.from(map.values());
  ordered.sort((a, b) => {
    const aRank = getBudgetSortRank(a.concept);
    const bRank = getBudgetSortRank(b.concept);
    if (aRank !== bRank) return aRank - bRank;
    return normalizeConceptKey(a.concept).localeCompare(normalizeConceptKey(b.concept));
  });
  return ordered;
};

export const getDefaultBudgetTemplate = (): ApiProjectBudgetLine[] => {
  const now = new Date().toISOString();
  const rows = [
    'EQUIPOS (Amortizacion)',
    'PERSONAL',
    'Doctores',
    'Titulados universitarios',
    'No titulado',
    'MATERIAL FUNGIBLE',
    'Materiales para pruebas y ensayos',
    'COLABORACIONES EXTERNAS',
    'GASTOS GENERALES',
    'OTROS GASTOS',
    'Auditoria',
    'Dictamen acreditado ENAC de informe DNSH',
    'Total',
    'Diferencia (por justificar)',
  ];

  return rows.map((concept, index) => ({
    id: -(index + 1),
    project_id: 0,
    concept,
    hito1_budget: 0,
    justified_hito1: 0,
    hito2_budget: 0,
    justified_hito2: 0,
    approved_budget: 0,
    percent_spent: 0,
    forecasted_spent: 0,
    created_at: now,
  }));
};
