import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { AlbaranAttachmentsRow } from '@/components/work-report/shared/AlbaranAttachmentsRow';
import type { ServiceLine } from '@/components/work-report/types';
import { sanitizeText } from '@/components/work-report/helpers';
import {
  normalizeDocType,
  type ParsedAlbaranItem,
  type ParsedDocIntMeta,
  type ParsedAlbaranResult,
  type ParsedFieldConfidence,
  type ParsedFieldWarnings,
} from '@/plugins/albaranScanner';

type ScanReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string | null;
  docType: ParsedAlbaranResult['docType'];
  docSubtype: ParsedAlbaranResult['docSubtype'];
  confidence: ParsedAlbaranResult['confidence'];
  profileUsed: ParsedAlbaranResult['profileUsed'];
  score: number;
  warnings: string[];
  supplier: string;
  invoiceNumber: string;
  documentDate: string;
  serviceDescription: string;
  fieldConfidence: ParsedFieldConfidence | null;
  fieldWarnings: ParsedFieldWarnings | null;
  fieldMeta: ParsedAlbaranResult['fieldMeta'] | null;
  templateData: ParsedAlbaranResult['templateData'] | null;
  source: ParsedAlbaranResult['source'];
  docIntMeta: ParsedDocIntMeta | null;
  imageUris: string[];
  items: ParsedAlbaranItem[];
  serviceLines: ServiceLine[];
  onOpenViewer: () => void;
  onSupplierChange: (value: string) => void;
  onInvoiceNumberChange: (value: string) => void;
  onDocumentDateChange: (value: string) => void;
  onServiceDescriptionChange: (value: string) => void;
  onUpdateItem: (index: number, patch: Partial<ParsedAlbaranItem>) => void;
  onAddItem: () => void;
  onUpdateServiceLine: (lineId: string, patch: Partial<ServiceLine>) => void;
  onAddServiceLine: () => void;
  onRemoveServiceLine: (lineId: string) => void;
  onCreateOtrosLine: () => void;
  onCancel: () => void;
  onApply: () => void;
  parseNumeric: (value: string) => number;
};

export const ScanReviewDialog = ({
  open,
  onOpenChange,
  reason,
  docType,
  docSubtype,
  confidence,
  profileUsed,
  score,
  warnings,
  supplier,
  invoiceNumber,
  documentDate,
  serviceDescription,
  fieldConfidence,
  fieldWarnings,
  fieldMeta,
  templateData,
  source,
  docIntMeta,
  imageUris,
  items,
  serviceLines,
  onOpenViewer,
  onSupplierChange,
  onInvoiceNumberChange,
  onDocumentDateChange,
  onServiceDescriptionChange,
  onUpdateItem,
  onAddItem,
  onUpdateServiceLine,
  onAddServiceLine,
  onRemoveServiceLine,
  onCreateOtrosLine,
  onCancel,
  onApply,
  parseNumeric,
}: ScanReviewDialogProps) => {
  const serviceSubtypeSet = new Set<NonNullable<ParsedAlbaranResult['docSubtype']>>([
    'BOMBEOS_GILGIL_ALBARAN_BOMBA',
    'RECICLESAN_ALBARAN_JORNADA_MAQUINA',
    'CONSTRUCCIONES_PARTE_TRABAJO',
  ]);
  const warningSet = new Set(warnings);
  const hasServiceWarning =
    warningSet.has('SERVICE_LAYOUT_HEADER') ||
    warningSet.has('SERVICE_MARKERS_DETECTED') ||
    warningSet.has('SERVICE_TABLE_DETECTED');
  const hasServiceUnitInItems = items.some((item) => {
    const unit = sanitizeText(item.unit).toLowerCase();
    return (
      unit === 'h' ||
      unit === 'hora' ||
      unit === 'horas' ||
      unit === 'viaje' ||
      unit === 'viajes' ||
      unit === 't' ||
      unit === 'tn' ||
      unit === 'm3' ||
      unit === 'mÂ³'
    );
  });
  const hasServiceDescription = sanitizeText(serviceDescription).length > 0;
  const normalizedDocType = normalizeDocType(docType);
  const isServiceDoc =
    normalizedDocType === 'SERVICE_MACHINERY' ||
    hasServiceWarning ||
    hasServiceUnitInItems ||
    (docSubtype ? serviceSubtypeSet.has(docSubtype) : false) ||
    serviceLines.length > 0 ||
    (hasServiceDescription && normalizedDocType !== 'MATERIALS_TABLE');
  const noStrongTable = normalizedDocType !== 'MATERIALS_TABLE' || warnings.includes('NO_TABLE_STRONG');
  const hasNoPriceColumnsWarning = warnings.includes('NO_PRICE_COLUMNS');
  const serviceInfoWarnings = new Set(['NO_PRICE_COLUMNS', 'NO_ECONOMIC_COLUMNS', 'MISSING_INVOICE_NUMBER', 'MISSING_DATE']);
  const fieldMetaJson = fieldMeta ? JSON.stringify(fieldMeta, null, 2) : null;
  const templateDataJson = templateData ? JSON.stringify(templateData, null, 2) : null;
  const showRuntimeTrace = import.meta.env.DEV;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Revision de albaran escaneado</DialogTitle>
          <DialogDescription>
            {isServiceDoc
              ? 'Ajusta los datos detectados antes de aplicarlos al detalle de servicio.'
              : 'Ajusta los datos detectados antes de aplicarlos al bloque de materiales.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {reason ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {reason}
            </div>
          ) : null}

          {noStrongTable ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {isServiceDoc
                ? 'No se detecto una tabla de servicio con fiabilidad. Puedes anadir filas manualmente o cancelar.'
                : 'No se detecto una tabla de materiales con fiabilidad. Puedes anadir filas manualmente o cancelar.'}
            </div>
          ) : null}

          {hasNoPriceColumnsWarning && !isServiceDoc ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>
                Este albaran no incluye precios/importes. Materiales no puede imputar coste automaticamente.
              </p>
              <Button variant="outline" onClick={onCreateOtrosLine}>
                Crear linea OTROS
              </Button>
            </div>
          ) : null}

          <div className="rounded-md border border-[#d9e1ea] bg-slate-50 p-3 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <div>
                <span className="font-medium text-slate-600">Tipo:</span> {normalizedDocType}
              </div>
              <div className="md:col-span-2">
                <span className="font-medium text-slate-600">Subtipo:</span> {docSubtype || 'No detectado'}
              </div>
              <div>
                <span className="font-medium text-slate-600">Confianza:</span> {confidence}
              </div>
              <div>
                <span className="font-medium text-slate-600">Perfil OCR:</span> {profileUsed}
              </div>
              <div className="md:col-span-1">
                <span className="font-medium text-slate-600">Score:</span> {score.toFixed(1)}
              </div>
            </div>
            {warnings.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {warnings.map((warning) => (
                  <span
                    key={`scan-warning-${warning}`}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isServiceDoc && serviceInfoWarnings.has(warning)
                        ? 'border border-blue-200 bg-blue-50 text-blue-700'
                        : 'border border-amber-300 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {warning}
                  </span>
                ))}
              </div>
            ) : null}
            {showRuntimeTrace ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                  source: {source}
                </span>
                {source === 'azure' && docIntMeta ? (
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                    {docIntMeta.modelUsed} @ {docIntMeta.apiVersion}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {fieldMetaJson || templateDataJson ? (
            <details className="rounded-md border border-[#d9e1ea] bg-slate-50 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-slate-700">
                Detalle IA (fieldMeta/templateData)
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {fieldMetaJson ? (
                  <div className="rounded border border-[#d9e1ea] bg-white p-2">
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">fieldMeta</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">
                      {fieldMetaJson}
                    </pre>
                  </div>
                ) : null}
                {templateDataJson ? (
                  <div className="rounded border border-[#d9e1ea] bg-white p-2">
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">templateData</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">
                      {templateDataJson}
                    </pre>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>Proveedor</Label>
              <Input
                className={`mt-1 ${
                  (fieldConfidence?.supplier ?? 1) < 0.65 || (fieldWarnings?.supplier?.length ?? 0) > 0
                    ? 'border-amber-400 focus-visible:ring-amber-400'
                    : ''
                }`}
                value={supplier}
                onChange={(event) => onSupplierChange(sanitizeText(event.target.value))}
                placeholder="Proveedor"
              />
              {(fieldWarnings?.supplier?.length ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-amber-700">{fieldWarnings?.supplier?.join(' · ')}</p>
              ) : null}
            </div>
            <div>
              <Label>Nº Albaran</Label>
              <Input
                className={`mt-1 ${
                  (fieldConfidence?.invoiceNumber ?? 1) < 0.65 || (fieldWarnings?.invoiceNumber?.length ?? 0) > 0
                    ? 'border-amber-400 focus-visible:ring-amber-400'
                    : ''
                }`}
                value={invoiceNumber}
                onChange={(event) => onInvoiceNumberChange(sanitizeText(event.target.value))}
                placeholder="Numero de albaran"
              />
              {(fieldWarnings?.invoiceNumber?.length ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-amber-700">{fieldWarnings?.invoiceNumber?.join(' · ')}</p>
              ) : null}
            </div>
            <div>
              <Label>Fecha documento</Label>
              <Input
                className={`mt-1 ${
                  (fieldConfidence?.documentDate ?? 1) < 0.65 || (fieldWarnings?.documentDate?.length ?? 0) > 0
                    ? 'border-amber-400 focus-visible:ring-amber-400'
                    : ''
                }`}
                value={documentDate}
                onChange={(event) => onDocumentDateChange(sanitizeText(event.target.value))}
                placeholder="YYYY-MM-DD"
              />
              {(fieldWarnings?.documentDate?.length ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-amber-700">{fieldWarnings?.documentDate?.join(' · ')}</p>
              ) : null}
            </div>
          </div>

          {isServiceDoc ? (
            <div>
              <Label>Descripcion de servicio detectada</Label>
              <Input
                className="mt-1"
                value={serviceDescription}
                onChange={(event) => onServiceDescriptionChange(sanitizeText(event.target.value))}
                placeholder="Descripcion del servicio"
              />
            </div>
          ) : null}

          {imageUris.length > 0 ? (
            <div className="rounded-md border border-[#d9e1ea] bg-slate-50">
              <AlbaranAttachmentsRow imageUris={imageUris} onOpenViewer={onOpenViewer} />
            </div>
          ) : null}

          {!isServiceDoc ? (
            <div className="max-h-[46vh] space-y-2 overflow-y-auto rounded-md border border-[#d9e1ea] p-2">
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d9e1ea] bg-slate-50 px-3 py-4 text-sm text-slate-600">
                  No hay filas autogeneradas. Usa "Añadir fila" para introducir materiales manualmente.
                </div>
              ) : null}
              {items.map((item, index) => (
                <div key={`scan-review-${index}`} className="rounded-md border border-[#d9e1ea] p-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <div className="md:col-span-2">
                      <Label className="text-xs text-slate-600">Material</Label>
                      <Input
                        className="mt-1"
                        value={item.material}
                        onChange={(event) => onUpdateItem(index, { material: sanitizeText(event.target.value) })}
                        placeholder="Material"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Cantidad</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        step={0.01}
                        value={item.quantity ?? ''}
                        onChange={(event) =>
                          onUpdateItem(index, {
                            quantity: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Unidad</Label>
                      <Input
                        className="mt-1"
                        value={item.unit ?? ''}
                        onChange={(event) => onUpdateItem(index, { unit: sanitizeText(event.target.value) || null })}
                        placeholder="ud, m2, kg..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Precio/Ud</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        step={0.01}
                        value={item.unitPrice ?? ''}
                        onChange={(event) =>
                          onUpdateItem(index, {
                            unitPrice: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <Label className="text-xs text-slate-600">Coste documento</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        step={0.01}
                        value={item.costDoc ?? ''}
                        onChange={(event) =>
                          onUpdateItem(index, {
                            costDoc: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs text-slate-600">Texto OCR</Label>
                      <Input className="mt-1" value={item.rowText || ''} readOnly />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-[#d9e1ea] p-2">
              <p className="px-1 text-sm font-semibold uppercase text-slate-700">Detalle de servicio</p>
              {serviceLines.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d9e1ea] bg-slate-50 px-3 py-4 text-sm text-slate-600">
                  No hay filas autogeneradas. Usa "Añadir fila" para introducir el detalle de servicio manualmente.
                </div>
              ) : null}
              {serviceLines.map((line) => (
                <div key={line.id} className="rounded-md border border-[#d9e1ea] p-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-4">
                      <Label className="text-xs text-slate-600">Descripcion</Label>
                      <Input
                        className="mt-1"
                        value={line.description}
                        onChange={(event) => onUpdateServiceLine(line.id, { description: sanitizeText(event.target.value) })}
                        placeholder="Descripcion del servicio"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs text-slate-600">Horas (h)</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.hours ?? ''}
                        onChange={(event) =>
                          onUpdateServiceLine(line.id, {
                            hours: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs text-slate-600">Viajes</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.trips ?? ''}
                        onChange={(event) =>
                          onUpdateServiceLine(line.id, {
                            trips: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs text-slate-600">Toneladas (t)</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.tons ?? ''}
                        onChange={(event) =>
                          onUpdateServiceLine(line.id, {
                            tons: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-6 md:col-span-1">
                      <Label className="text-xs text-slate-600">m3</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.m3 ?? ''}
                        onChange={(event) =>
                          onUpdateServiceLine(line.id, {
                            m3: event.target.value === '' ? null : parseNumeric(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-12 md:col-span-1 md:flex md:items-end md:justify-center">
                      <Button
                        className="h-9 w-full md:h-10 md:w-10"
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveServiceLine(line.id)}
                        disabled={serviceLines.length === 1}
                        title="Eliminar fila de servicio"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={isServiceDoc ? onAddServiceLine : onAddItem}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir fila
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button onClick={onApply}>Aplicar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { ScanReviewDialogProps };
