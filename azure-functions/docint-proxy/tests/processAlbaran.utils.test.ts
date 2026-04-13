import assert from 'node:assert/strict';
import test from 'node:test';

import type { ParsedDocIntOutput } from '../src/schema';
import {
  estimatePdfPageCount,
  isSupportedUploadMimeType,
  pickBetter,
  scoreCandidate,
} from '../src/functions/processAlbaran.utils';

const buildCandidate = (
  overrides: Partial<ParsedDocIntOutput> = {},
): ParsedDocIntOutput => ({
  docType: 'MATERIALS_TABLE',
  docSubtype: null,
  supplier: { value: 'Proveedor Uno', confidence: 0.9 },
  invoiceNumber: { value: 'FAC-2026-001', confidence: 0.95 },
  documentDate: { value: '2026-03-01', confidence: 0.8 },
  items: [
    {
      reference: 'MAT-01',
      description: 'Arena',
      quantity: 2,
      unit: 'm3',
      unitPrice: 10,
      lineTotal: 20,
      confidence: 0.9,
    },
  ],
  totals: { subtotal: 20, tax: 4.2, total: 24.2 },
  fieldMeta: undefined,
  templateData: null,
  warnings: [],
  ...overrides,
});

test('isSupportedUploadMimeType accepts pdf and image uploads', () => {
  assert.equal(isSupportedUploadMimeType('application/pdf'), true);
  assert.equal(isSupportedUploadMimeType(' image/jpeg '), true);
  assert.equal(isSupportedUploadMimeType('text/plain'), false);
});

test('estimatePdfPageCount extracts the largest /Count value from a pdf sample', () => {
  const fakePdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 2 >>\n2 0 obj\n<< /Count 5 >>');
  assert.equal(estimatePdfPageCount(fakePdf, 'application/pdf'), 5);
  assert.equal(estimatePdfPageCount(Buffer.from('not-a-pdf'), 'image/png'), null);
});

test('pickBetter prefers the fallback candidate when it scores higher', () => {
  const weakPrimary = buildCandidate({
    items: [],
    invoiceNumber: { value: '12345', confidence: 0.2 },
    warnings: ['NO_TABLE_STRONG', 'MISSING_INVOICE_NUMBER'],
  });
  const strongFallback = buildCandidate();

  assert.ok(scoreCandidate(strongFallback) > scoreCandidate(weakPrimary));
  assert.equal(pickBetter(weakPrimary, strongFallback), strongFallback);
  assert.equal(pickBetter(strongFallback, weakPrimary), strongFallback);
});
