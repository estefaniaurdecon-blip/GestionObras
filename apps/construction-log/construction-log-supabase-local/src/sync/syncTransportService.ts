import { apiFetchJson } from '@/integrations/api/client';
import { type WorkReportSyncAck, type WorkReportSyncRequest, type WorkReportSyncResponse } from '@/services/workReportContract';

import { getCompatRetryPayload } from './syncRobustnessRules';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Error de sincronización';
}

function shouldRetryServerChangesSerialization(error: unknown): boolean {
  const message = toSyncErrorMessage(error).toLowerCase();
  return (
    message.includes('workreportsyncresponse') ||
    message.includes('server_changes') ||
    message.includes('workreportread') ||
    message.includes('model_type')
  );
}

function sanitizeUpdateOperationDataForTransport(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };
  delete next.date;

  if (isRecord(next.patch)) {
    const patch: Record<string, unknown> = { ...next.patch };
    delete patch.date;
    next.patch = patch;
  }

  return next;
}

function sanitizeSyncRequestForTransport(requestPayload: WorkReportSyncRequest): WorkReportSyncRequest {
  return {
    ...requestPayload,
    operations: requestPayload.operations.map((operation) => {
      if (operation.op !== 'update' || !isRecord(operation.data)) {
        return operation;
      }

      return {
        ...operation,
        data: sanitizeUpdateOperationDataForTransport(operation.data),
      };
    }),
  };
}

export function buildSyncAckMap(response: WorkReportSyncResponse): Map<string, WorkReportSyncAck> {
  const ackMap = new Map<string, WorkReportSyncAck>();
  for (const ack of response.ack ?? []) {
    ackMap.set(ack.client_op_id, ack);
  }
  return ackMap;
}

export async function sendSyncBatch(
  tenantId: string,
  requestPayload: WorkReportSyncRequest
): Promise<WorkReportSyncResponse> {
  const sanitizedRequestPayload = sanitizeSyncRequestForTransport(requestPayload);

  const doRequest = async (payload: WorkReportSyncRequest): Promise<WorkReportSyncResponse> => {
    return apiFetchJson<WorkReportSyncResponse>('/api/v1/erp/work-reports/sync', {
      method: 'POST',
      headers: { 'X-Tenant-Id': tenantId },
      body: JSON.stringify(payload),
    });
  };

  try {
    return await doRequest(sanitizedRequestPayload);
  } catch (error) {
    if (!shouldRetryServerChangesSerialization(error)) {
      throw error;
    }

    const compatRetryPayload = getCompatRetryPayload(sanitizedRequestPayload, true);
    if (!compatRetryPayload) {
      throw error;
    }

    console.warn('[Sync][compat-retry] Reintento único por bug backend en server_changes.', {
      tenantId,
      retryPayload: compatRetryPayload,
      originalError: toSyncErrorMessage(error),
      todo: 'Backend debe serializar server_changes con model_dump() y no ORM directo.',
    });
    return doRequest(compatRetryPayload);
  }
}
