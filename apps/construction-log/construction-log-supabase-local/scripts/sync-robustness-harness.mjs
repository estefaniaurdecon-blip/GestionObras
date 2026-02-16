import assert from 'node:assert/strict';
import {
  buildDeterministicClientOpId,
  decideConsolidatedAction,
  getCompatRetryPayload,
  shouldClearOutboxForAck,
} from '../src/sync/syncRobustnessRules.js';

function testCreateUpdateUpdateConsolidatesToCreate() {
  const entries = [
    {
      id: 'op-create',
      entityId: 'local-1',
      op: 'create',
      createdAt: 1000,
      parsedPayload: { id: 'local-1', updatedAt: 1000 },
    },
    {
      id: 'op-update-2',
      entityId: 'local-1',
      op: 'update',
      createdAt: 2000,
      parsedPayload: { id: 'local-1', updatedAt: 3000 },
    },
    {
      id: 'op-update-1',
      entityId: 'local-1',
      op: 'update',
      createdAt: 3000,
      parsedPayload: { id: 'local-1', updatedAt: 2000 },
    },
  ];

  const result = decideConsolidatedAction({
    localReportId: 'local-1',
    entries,
    serverReportId: null,
  });

  assert.equal(result.kind, 'create');
  assert.deepEqual(result.outboxIds, ['op-create', 'op-update-1', 'op-update-2']);
}

function testAckFailDoesNotClearOutbox() {
  assert.equal(shouldClearOutboxForAck({ ok: false }), false);
  assert.equal(shouldClearOutboxForAck(undefined), false);
  assert.equal(shouldClearOutboxForAck({ ok: true }), true);
}

function testCompatRetryRunsAtMostOnce() {
  const original = {
    since: '2026-02-12T10:00:00Z',
    operations: [],
    include_deleted: true,
    limit: 200,
  };

  const retry = getCompatRetryPayload(original, true);
  assert.ok(retry);
  assert.equal(retry.since, null);

  const secondRetry = getCompatRetryPayload(retry, true);
  assert.equal(secondRetry, null);
}

function testDeterministicClientOpId() {
  const params = {
    tenantId: '1',
    localReportId: 'local-1',
    op: 'create',
    serverReportId: null,
    outboxIds: ['a', 'b', 'c'],
  };

  const first = buildDeterministicClientOpId(params);
  const second = buildDeterministicClientOpId({
    ...params,
    outboxIds: ['c', 'a', 'b'],
  });
  const third = buildDeterministicClientOpId({
    ...params,
    outboxIds: ['a', 'b', 'd'],
  });

  assert.equal(first, second);
  assert.notEqual(first, third);
}

function run() {
  testCreateUpdateUpdateConsolidatesToCreate();
  testAckFailDoesNotClearOutbox();
  testCompatRetryRunsAtMostOnce();
  testDeterministicClientOpId();
  console.log('[sync-robustness-harness] OK');
}

run();

