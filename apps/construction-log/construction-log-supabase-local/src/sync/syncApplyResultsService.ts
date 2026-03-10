import { offlineDb } from '@/offline-db/db';
import { type WorkReportSyncAck, type WorkReportSyncResponse } from '@/services/workReportContract';

type SyncApplyPlanTarget = {
  localReportId: string;
  outboxIds: string[];
  [key: string]: unknown;
};

type SyncApplyOperationPlanTarget = SyncApplyPlanTarget & {
  serverReportId: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveMappedServerId(
  plan: SyncApplyOperationPlanTarget,
  ack: WorkReportSyncAck | undefined,
  response: WorkReportSyncResponse
): number | null {
  if (typeof ack?.mapped_server_id === 'number' && Number.isFinite(ack.mapped_server_id)) {
    return ack.mapped_server_id;
  }
  if (typeof ack?.report_id === 'number' && Number.isFinite(ack.report_id)) {
    return ack.report_id;
  }
  if (response.id_map && typeof response.id_map[plan.localReportId] === 'number') {
    return response.id_map[plan.localReportId];
  }
  return plan.serverReportId ?? null;
}

export async function markEntriesAsSynced(
  plan: SyncApplyPlanTarget,
  mappedServerId: number | null
): Promise<void> {
  const outboxIds = plan.outboxIds;
  if (outboxIds.length === 0) return;

  await offlineDb.transaction(async (tx) => {
    const reportRows = await tx.query<{ payload_json: string }>(
      'SELECT payload_json FROM work_reports WHERE id = ? LIMIT 1;',
      [plan.localReportId]
    );

    if (reportRows.length > 0) {
      const currentPayload = toJsonRecord(reportRows[0].payload_json);
      if (mappedServerId !== null) {
        currentPayload.serverReportId = mappedServerId;
      }
      await tx.run(
        `UPDATE work_reports
         SET payload_json = ?,
             sync_status = 'synced',
             last_sync_error = NULL
         WHERE id = ?;`,
        [JSON.stringify(currentPayload), plan.localReportId]
      );
    } else {
      await tx.run(
        `UPDATE work_reports
         SET sync_status = 'synced',
             last_sync_error = NULL
         WHERE id = ?;`,
        [plan.localReportId]
      );
    }

    const placeholders = outboxIds.map(() => '?').join(', ');
    await tx.run(`DELETE FROM outbox WHERE id IN (${placeholders});`, outboxIds);
  });
}

export async function markPlanError(plan: SyncApplyPlanTarget, errorMessage: string): Promise<void> {
  const outboxIds = plan.outboxIds;
  if (outboxIds.length === 0) return;

  await offlineDb.transaction(async (tx) => {
    const placeholders = outboxIds.map(() => '?').join(', ');
    await tx.run(
      `UPDATE outbox
       SET status = 'pending',
           attempts = attempts + 1,
           last_error = ?
       WHERE id IN (${placeholders});`,
      [errorMessage, ...outboxIds]
    );

    await tx.run(
      `UPDATE work_reports
       SET sync_status = 'pending',
           last_sync_error = ?
       WHERE id = ?;`,
      [errorMessage, plan.localReportId]
    );
  });
}
