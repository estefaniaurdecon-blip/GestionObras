import { apiFetchJson } from '@/integrations/api/client';

export type ApiProjectLookup = {
  id: number;
  name?: string | null;
  code?: string | null;
};

type LocalWorkReportSnapshot = {
  id: string;
  project_id: string | null;
  title: string | null;
  date: string;
  status: string;
  payload_json: string;
  deleted_at: number | null;
};

type PendingEntry = {
  id: string;
  entity: string;
  entityId: string;
  op: 'create' | 'update' | 'delete';
  createdAt: number;
  tenantId: string | null;
  parsedPayload: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Helpers internos (movidos desde syncService.ts)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeLookupText(value: unknown): string | null {
  const base = asString(typeof value === 'number' ? String(value) : value);
  if (!base) return null;
  return base.toLowerCase();
}

// ---------------------------------------------------------------------------
// Resolución de project_id
// ---------------------------------------------------------------------------

async function fetchProjectsForTenant(tenantId: string): Promise<ApiProjectLookup[]> {
  try {
    return await apiFetchJson<ApiProjectLookup[]>('/api/v1/erp/projects', {
      method: 'GET',
      headers: { 'X-Tenant-Id': tenantId },
    });
  } catch (error) {
    console.warn('[Sync] No se pudieron cargar proyectos para resolver project_id.', {
      tenantId,
      error,
    });
    return [];
  }
}

export async function getTenantProjects(
  tenantId: string,
  cache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<ApiProjectLookup[]> {
  const cached = cache.get(tenantId);
  if (cached) return cached;
  const request = fetchProjectsForTenant(tenantId);
  cache.set(tenantId, request);
  return request;
}

function warnUnresolvedProjectId(
  tenantId: string,
  snapshot: LocalWorkReportSnapshot,
  payload: Record<string, unknown>,
  reason: 'no_candidates' | 'no_projects' | 'no_match'
): void {
  console.warn('[Sync] project_id no resuelto; se aborta sync.', {
    tenantId,
    localReportId: snapshot.id,
    reportId: toInteger(payload.serverReportId ?? payload.server_report_id),
    localProjectId: snapshot.project_id,
    reason,
  });
}

export async function resolveProjectIdForSync(
  snapshot: LocalWorkReportSnapshot,
  payload: Record<string, unknown>,
  tenantId: string,
  projectCache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<number | null> {
  const directCandidates: unknown[] = [
    snapshot.project_id,
    payload.project_id,
    payload.projectId,
    payload.work_id,
    payload.workId,
  ];

  for (const candidate of directCandidates) {
    const numeric = toInteger(candidate);
    if (numeric !== null) return numeric;
  }

  const textCandidates = [
    normalizeLookupText(snapshot.project_id),
    normalizeLookupText(payload.project_id),
    normalizeLookupText(payload.projectId),
    normalizeLookupText(payload.work_id),
    normalizeLookupText(payload.workId),
    normalizeLookupText(payload.workNumber),
    normalizeLookupText(payload.work_name),
    normalizeLookupText(payload.workName),
    normalizeLookupText(payload.project_name),
    normalizeLookupText(payload.projectName),
  ].filter((value): value is string => Boolean(value));

  if (textCandidates.length === 0) {
    warnUnresolvedProjectId(tenantId, snapshot, payload, 'no_candidates');
    return null;
  }

  const projects = await getTenantProjects(tenantId, projectCache);
  if (projects.length === 0) {
    warnUnresolvedProjectId(tenantId, snapshot, payload, 'no_projects');
    return null;
  }

  for (const candidate of textCandidates) {
    const numeric = toInteger(candidate);
    if (numeric !== null && projects.some((project) => project.id === numeric)) {
      return numeric;
    }
  }

  for (const candidate of textCandidates) {
    const byCode = projects.find((project) => normalizeLookupText(project.code) === candidate);
    if (byCode) return byCode.id;
  }

  for (const candidate of textCandidates) {
    const byName = projects.find((project) => normalizeLookupText(project.name) === candidate);
    if (byName) return byName.id;
  }

  warnUnresolvedProjectId(tenantId, snapshot, payload, 'no_match');
  return null;
}

// ---------------------------------------------------------------------------
// Resolución de serverReportId
// ---------------------------------------------------------------------------

export function readServerReportIdFromPayload(payload: Record<string, unknown>): number | null {
  const direct = toInteger(payload.serverReportId ?? payload.server_report_id);
  if (direct !== null) return direct;

  const nestedPayload = isRecord(payload.payload) ? payload.payload : null;
  if (nestedPayload) {
    const nested = toInteger(nestedPayload.serverReportId ?? nestedPayload.server_report_id);
    if (nested !== null) return nested;
  }

  const patch = isRecord(payload.patch) ? payload.patch : null;
  if (patch) {
    const patchDirect = toInteger(patch.serverReportId ?? patch.server_report_id);
    if (patchDirect !== null) return patchDirect;
    const patchPayload = isRecord(patch.payload) ? patch.payload : null;
    if (patchPayload) {
      const patchNested = toInteger(patchPayload.serverReportId ?? patchPayload.server_report_id);
      if (patchNested !== null) return patchNested;
    }
  }

  return null;
}

export function inferServerReportIdFromLocalId(localReportId: string): number | null {
  if (!localReportId.startsWith('srv-')) return null;
  return toInteger(localReportId.replace('srv-', ''));
}

export function resolveServerReportId(
  localReportId: string,
  snapshotPayload: Record<string, unknown>,
  sourceEntries: PendingEntry[]
): number | null {
  const fromSnapshot = readServerReportIdFromPayload(snapshotPayload);
  if (fromSnapshot !== null) return fromSnapshot;

  for (const entry of sourceEntries) {
    const fromEntry = readServerReportIdFromPayload(entry.parsedPayload);
    if (fromEntry !== null) return fromEntry;
  }

  return inferServerReportIdFromLocalId(localReportId);
}
