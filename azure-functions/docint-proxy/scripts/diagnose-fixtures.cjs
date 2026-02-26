#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { DocIntClient } = require('../dist/src/docint/client.js');
const {
  parsePrimaryInvoice,
  parseLayoutOrRead,
  shouldUseFallbackModel,
} = require('../dist/src/docint/parsers.js');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const fixturesDir = path.join(
  repoRoot,
  'apps',
  'construction-log',
  'construction-log-supabase-local',
  'test-fixtures',
  'albaranes',
);
const settingsPath = path.join(__dirname, '..', 'local.settings.json');

function loadSettings() {
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Missing settings: ${settingsPath}`);
  }
  const raw = fs.readFileSync(settingsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const values = parsed?.Values || {};
  return {
    endpoint: String(values.DOCINT_ENDPOINT || '').trim(),
    apiKey: String(values.DOCINT_KEY || '').trim(),
    apiVersion: String(values.DOCINT_API_VERSION || '2024-11-30').trim(),
    locale: String(values.DOCINT_LOCALE || 'es-ES').trim(),
    modelPrimary: String(values.DOCINT_MODEL_PRIMARY || 'prebuilt-layout').trim(),
    modelFallback: String(values.DOCINT_MODEL_FALLBACK || 'prebuilt-read').trim(),
    pagesLimit: String(values.DOCINT_PAGES_LIMIT || '').trim() || undefined,
    timeoutMs: Number(values.DOCINT_TIMEOUT_MS || 60000),
  };
}

function mimeFromFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(parsed) {
  return {
    docType: parsed.docType,
    supplier: parsed.supplier?.value || null,
    supplierConf: parsed.supplier?.confidence ?? null,
    invoice: parsed.invoiceNumber?.value || null,
    invoiceConf: parsed.invoiceNumber?.confidence ?? null,
    date: parsed.documentDate?.value || null,
    dateConf: parsed.documentDate?.confidence ?? null,
    items: Array.isArray(parsed.items) ? parsed.items.length : 0,
    sampleItems: (parsed.items || []).slice(0, 3).map((it) => ({
      reference: it.reference,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
    })),
    warnings: parsed.warnings || [],
  };
}

function pickBetter(primary, fallback) {
  if (fallback.docType === 'MATERIALS_TABLE' && fallback.items.length > 0) return fallback;
  if (primary.docType === 'MATERIALS_TABLE' && primary.items.length > 0) return primary;
  if (fallback.docType === 'SERVICE_MACHINERY' && primary.docType !== 'SERVICE_MACHINERY') return fallback;

  const primaryKeyScore =
    Number(Boolean(primary.supplier.value)) +
    Number(Boolean(primary.invoiceNumber.value)) +
    Number(Boolean(primary.documentDate.value));
  const fallbackKeyScore =
    Number(Boolean(fallback.supplier.value)) +
    Number(Boolean(fallback.invoiceNumber.value)) +
    Number(Boolean(fallback.documentDate.value));
  return fallbackKeyScore > primaryKeyScore ? fallback : primary;
}

function parseByModel(modelId, raw) {
  const normalizedModel = String(modelId || '').trim().toLowerCase();
  if (normalizedModel.includes('invoice')) {
    return parsePrimaryInvoice(raw);
  }
  if (normalizedModel.includes('read')) {
    return parseLayoutOrRead(raw, 'prebuilt-read');
  }
  if (normalizedModel.includes('layout')) {
    return parseLayoutOrRead(raw, 'prebuilt-layout');
  }
  return parseLayoutOrRead(raw, normalizedModel || 'prebuilt-layout');
}

async function run() {
  const settings = loadSettings();
  if (!settings.endpoint || !settings.apiKey) {
    throw new Error('DOCINT_ENDPOINT / DOCINT_KEY missing in local.settings.json');
  }

  if (!fs.existsSync(fixturesDir)) {
    throw new Error(`Fixtures folder not found: ${fixturesDir}`);
  }

  const files = fs
    .readdirSync(fixturesDir)
    .filter((name) => /\.(pdf|png|jpe?g)$/i.test(name))
    .sort();
  if (!files.length) {
    console.log('No fixture files found.');
    return;
  }

  const client = new DocIntClient({
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    apiVersion: settings.apiVersion,
    locale: settings.locale,
    timeoutMs: settings.timeoutMs,
    pagesLimit: settings.pagesLimit,
  });

  console.log(`Using endpoint: ${settings.endpoint}`);
  console.log(`Files: ${files.join(', ')}`);
  console.log('');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const filePath = path.join(fixturesDir, fileName);
    const bytes = fs.readFileSync(filePath);
    const base64Source = bytes.toString('base64');
    const contentType = mimeFromFile(fileName);

    console.log(`=== [${i + 1}/${files.length}] ${fileName} (${contentType}) ===`);
    try {
      const primaryRaw = await client.analyzeWithModel({
        modelId: settings.modelPrimary,
        base64Source,
        contentType,
      });
      const primaryParsed = parseByModel(settings.modelPrimary, primaryRaw);

      let fallbackParsed = null;
      if (shouldUseFallbackModel(primaryParsed)) {
        const fallbackRaw = await client.analyzeWithModel({
          modelId: settings.modelFallback,
          base64Source,
          contentType,
        });
        fallbackParsed = parseByModel(settings.modelFallback, fallbackRaw);
      }

      const selected = fallbackParsed ? pickBetter(primaryParsed, fallbackParsed) : primaryParsed;
      console.log('primary :', JSON.stringify(summarize(primaryParsed), null, 2));
      if (fallbackParsed) {
        console.log('fallback:', JSON.stringify(summarize(fallbackParsed), null, 2));
      } else {
        console.log('fallback: <skipped>');
      }
      console.log('selected:', JSON.stringify(summarize(selected), null, 2));
    } catch (error) {
      console.error(`ERROR ${fileName}:`, error?.message || error);
    }

    if (i < files.length - 1) {
      console.log('Waiting 35000ms to reduce F0 throttling...');
      await delay(35000);
    }
    console.log('');
  }
}

run().catch((error) => {
  console.error('diagnose-fixtures failed:', error?.message || error);
  process.exitCode = 1;
});
