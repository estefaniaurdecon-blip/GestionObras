import { type AccessEntry } from '@/types/accessControl';
import { asRecord, toOptionalString, toStringValue } from '@/pages/indexHelpers';

export function toAccessEntries(value: unknown, fallbackType: AccessEntry['type']): AccessEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((rawEntry) => {
    const record = asRecord(rawEntry) ?? {};
    const sourceRaw = toStringValue(record.source);
    const source = sourceRaw === 'subcontract' || sourceRaw === 'rental' ? sourceRaw : undefined;
    const typeRaw = toStringValue(record.type);
    const type: AccessEntry['type'] = typeRaw === 'machinery' ? 'machinery' : fallbackType;

    return {
      id: toStringValue(record.id, crypto.randomUUID()),
      type,
      name: toStringValue(record.name),
      identifier: toStringValue(record.identifier),
      company: toStringValue(record.company),
      entryTime: toStringValue(record.entryTime, '08:00'),
      exitTime: toOptionalString(record.exitTime),
      activity: toStringValue(record.activity),
      operator: toOptionalString(record.operator),
      signature: toOptionalString(record.signature),
      source,
    };
  });
}
