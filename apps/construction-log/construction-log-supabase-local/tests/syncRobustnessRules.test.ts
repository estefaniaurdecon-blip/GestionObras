import { describe, expect, it } from 'vitest';

import {
  buildDeterministicClientOpId,
  decideConsolidatedAction,
  getCompatRetryPayload,
  shouldClearOutboxForAck,
} from '../src/sync/syncRobustnessRules.js';

describe('syncRobustnessRules', () => {
  it('convierte create+delete local sin server id en noop', () => {
    const result = decideConsolidatedAction({
      localReportId: 'report-1',
      serverReportId: null,
      entries: [
        {
          id: 'outbox-1',
          entityId: 'report-1',
          op: 'create',
          createdAt: 10,
          parsedPayload: { id: 'report-1' },
        },
        {
          id: 'outbox-2',
          entityId: 'report-1',
          op: 'delete',
          createdAt: 20,
          parsedPayload: { id: 'report-1' },
        },
      ],
    });

    expect(result.kind).toBe('noop');
    expect(result.outboxIds).toEqual(['outbox-1', 'outbox-2']);
  });

  it('mantiene client_op_id estable aunque cambie el orden del outbox', () => {
    const left = buildDeterministicClientOpId({
      tenantId: 'tenant-1',
      localReportId: 'report-1',
      op: 'update',
      serverReportId: 99,
      outboxIds: ['b', 'a'],
    });
    const right = buildDeterministicClientOpId({
      tenantId: 'tenant-1',
      localReportId: 'report-1',
      op: 'update',
      serverReportId: 99,
      outboxIds: ['a', 'b'],
    });

    expect(left).toBe(right);
  });

  it('genera payload de compatibilidad solo cuando el retry lo requiere', () => {
    const payload = {
      since: '2026-03-01T00:00:00.000Z',
      operations: [],
      include_deleted: true,
    };

    expect(getCompatRetryPayload(payload, false)).toBeNull();
    expect(getCompatRetryPayload({ ...payload, since: null }, true)).toBeNull();
    expect(getCompatRetryPayload(payload, true)).toEqual({
      since: null,
      operations: [],
      include_deleted: true,
    });
  });

  it('solo limpia outbox con ack exitoso', () => {
    expect(shouldClearOutboxForAck({ ok: true })).toBe(true);
    expect(shouldClearOutboxForAck({ ok: false })).toBe(false);
    expect(shouldClearOutboxForAck(null)).toBe(false);
  });
});
