import { describe, expect, it } from 'vitest';

import {
  mergeMessageRecords,
  reconcileStoredMessageScopes,
  reconcileStoredMessagesWithServer,
  type StoredMessageRecord,
} from '@/hooks/messagingOfflineStore';

function buildMessage(overrides: Partial<StoredMessageRecord>): StoredMessageRecord {
  return {
    id: '1',
    from_user_id: '3',
    to_user_id: '4',
    message: 'Mensaje de prueba',
    read: false,
    created_at: '2026-04-13T07:40:00.000Z',
    syncStatus: 'synced',
    lastSyncError: null,
    ...overrides,
  };
}

describe('messagingOfflineStore', () => {
  it('reconcilia restos locales si ya existe el mismo mensaje en el servidor', () => {
    const serverItems = [
      buildMessage({
        id: '24776',
        created_at: '2026-04-13T07:40:03.000',
      }),
    ];
    const localItems = [
      buildMessage({
        id: 'local-message-1',
        created_at: '2026-04-13T07:40:02.000Z',
        syncStatus: 'error',
        lastSyncError: 'unexpected end of stream',
      }),
    ];

    expect(reconcileStoredMessagesWithServer(serverItems, localItems)).toEqual([]);
  });

  it('mantiene un mensaje local si no hay una coincidencia fiable en el servidor', () => {
    const serverItems = [
      buildMessage({
        id: '24776',
        created_at: '2026-04-13T08:10:00.000',
      }),
    ];
    const localItems = [
      buildMessage({
        id: 'local-message-1',
        created_at: '2026-04-13T07:40:02.000Z',
        syncStatus: 'error',
        lastSyncError: 'unexpected end of stream',
      }),
    ];

    expect(reconcileStoredMessagesWithServer(serverItems, localItems)).toEqual(localItems);
  });

  it('mergeMessageRecords conserva el mensaje del servidor y elimina el resto local reconciliado', () => {
    const serverItems = [
      buildMessage({
        id: '24776',
        created_at: '2026-04-13T07:40:03.000',
      }),
    ];
    const localItems = [
      buildMessage({
        id: 'local-message-1',
        created_at: '2026-04-13T07:40:02.000Z',
        syncStatus: 'error',
        lastSyncError: 'unexpected end of stream',
      }),
    ];

    const reconciled = reconcileStoredMessagesWithServer(serverItems, localItems);
    expect(mergeMessageRecords(serverItems, reconciled)).toEqual(serverItems);
  });

  it('reconcilia restos locales entre distintos scopes usando copias sincronizadas ya guardadas', () => {
    const scopes = [
      {
        scopeId: 'user-3::tenant-1',
        items: [
          buildMessage({
            id: '24776',
            from_user_id: '4',
            to_user_id: '3',
            message: 'Que pasooo',
            created_at: '2026-04-13T06:49:55.000',
          }),
        ],
      },
      {
        scopeId: 'user-4::tenant-1',
        items: [
          buildMessage({
            id: 'local-message-1',
            from_user_id: '4',
            to_user_id: '3',
            message: 'Que pasooo',
            created_at: '2026-04-13T06:49:51.438Z',
            syncStatus: 'pending',
            lastSyncError: 'Failed to fetch',
          }),
        ],
      },
    ];

    expect(reconcileStoredMessageScopes(scopes)).toEqual([
      scopes[0],
      {
        scopeId: 'user-4::tenant-1',
        items: [],
      },
    ]);
  });
});
