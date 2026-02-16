const CLIENT_OP_SCHEMA_VERSION = 'v4';

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hashStringToHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readIdentityCandidate(parsedPayload) {
  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    return null;
  }
  return (
    toStringOrNull(parsedPayload.client_temp_id) ??
    toStringOrNull(parsedPayload.clientTempId) ??
    toStringOrNull(parsedPayload.external_id) ??
    toStringOrNull(parsedPayload.externalId) ??
    toStringOrNull(parsedPayload.id)
  );
}

export function getEntryLogicalTimestamp(entry) {
  const parsedPayload =
    entry && typeof entry === 'object' && !Array.isArray(entry) ? entry.parsedPayload : null;
  const candidates = parsedPayload
    ? [
        parsedPayload.lastModifiedAt,
        parsedPayload.last_modified_at,
        parsedPayload.updatedAt,
        parsedPayload.updated_at,
        parsedPayload.deletedAt,
        parsedPayload.deleted_at,
        parsedPayload.createdAt,
        parsedPayload.created_at,
      ]
    : [];

  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed !== null && parsed > 0) return parsed;
  }

  return toNumber(entry?.createdAt) ?? 0;
}

export function sortEntriesByLogicalTime(entries) {
  return [...entries].sort((left, right) => {
    const leftAt = getEntryLogicalTimestamp(left);
    const rightAt = getEntryLogicalTimestamp(right);
    if (leftAt !== rightAt) return leftAt - rightAt;
    const leftId = toStringOrNull(left?.id) ?? '';
    const rightId = toStringOrNull(right?.id) ?? '';
    return leftId.localeCompare(rightId);
  });
}

export function decideConsolidatedAction(params) {
  const localReportId = toStringOrNull(params?.localReportId);
  const entries = Array.isArray(params?.entries) ? params.entries : [];
  const serverReportId = toNumber(params?.serverReportId);

  if (!localReportId) {
    return {
      kind: 'error',
      message: 'localReportId inválido en consolidación.',
      outboxIds: [],
      sortedEntries: [],
    };
  }

  const sortedEntries = sortEntriesByLogicalTime(entries);
  const outboxIds = sortedEntries
    .map((entry) => toStringOrNull(entry?.id))
    .filter(Boolean);

  if (sortedEntries.length === 0) {
    return {
      kind: 'error',
      message: 'No hay operaciones para consolidar.',
      outboxIds,
      sortedEntries,
    };
  }

  for (const entry of sortedEntries) {
    const entityId = toStringOrNull(entry?.entityId);
    if (!entityId || entityId !== localReportId) {
      return {
        kind: 'error',
        message: 'Se detectaron operaciones mezcladas de partes distintas.',
        outboxIds,
        sortedEntries,
      };
    }

    const identityCandidate = readIdentityCandidate(entry?.parsedPayload);
    if (identityCandidate && identityCandidate !== localReportId) {
      return {
        kind: 'error',
        message: 'Se detectaron IDs inconsistentes en el outbox del parte.',
        outboxIds,
        sortedEntries,
      };
    }
  }

  const hasCreate = sortedEntries.some((entry) => entry?.op === 'create');
  const lastOp = sortedEntries[sortedEntries.length - 1]?.op;

  if (hasCreate && lastOp === 'delete' && serverReportId === null) {
    return {
      kind: 'noop',
      message: 'Create+delete local sin server_id: no se envía al backend.',
      outboxIds,
      sortedEntries,
    };
  }

  if (lastOp === 'delete') {
    if (serverReportId === null) {
      return {
        kind: 'error',
        message: 'Delete pendiente sin server_id. Sincroniza primero la creación.',
        outboxIds,
        sortedEntries,
      };
    }
    return {
      kind: 'delete',
      outboxIds,
      sortedEntries,
    };
  }

  if (hasCreate) {
    return {
      kind: 'create',
      outboxIds,
      sortedEntries,
    };
  }

  if (serverReportId !== null) {
    return {
      kind: 'update',
      outboxIds,
      sortedEntries,
    };
  }

  return {
    kind: 'create',
    outboxIds,
    sortedEntries,
  };
}

export function buildDeterministicClientOpId(params) {
  const tenantId = toStringOrNull(params?.tenantId) ?? 'tenant-unknown';
  const localReportId = toStringOrNull(params?.localReportId) ?? 'report-unknown';
  const op = toStringOrNull(params?.op) ?? 'op-unknown';
  const serverReportId = toNumber(params?.serverReportId);
  const outboxIds = Array.isArray(params?.outboxIds)
    ? params.outboxIds
        .map((value) => toStringOrNull(value))
        .filter(Boolean)
        .sort()
    : [];

  const fingerprint = [
    CLIENT_OP_SCHEMA_VERSION,
    tenantId,
    localReportId,
    op,
    serverReportId === null ? 'none' : String(serverReportId),
    outboxIds.join('|'),
  ].join('::');

  return `wr-${CLIENT_OP_SCHEMA_VERSION}-${hashStringToHex(fingerprint)}`;
}

export function getCompatRetryPayload(requestPayload, shouldRetryError) {
  if (!shouldRetryError) return null;
  if (!requestPayload || typeof requestPayload !== 'object') return null;

  if (requestPayload.since === null) return null;

  return {
    ...requestPayload,
    since: null,
  };
}

export function shouldClearOutboxForAck(ack) {
  return Boolean(ack && ack.ok === true);
}

