import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, Save } from 'lucide-react';

type SaveActionsBarProps = {
  completedSections: string;
  totalWorkforceHours: number;
  saveStatusSummaryLabel: string;
  exportingPdf: boolean;
  exportingExcel: boolean;
  onDownloadPdf: () => void;
  onDownloadExcel: () => void;
  onSave: () => void;
  saving: boolean;
  readOnly: boolean;
};

export const SaveActionsBar = ({
  completedSections,
  totalWorkforceHours,
  saveStatusSummaryLabel,
  exportingPdf,
  exportingExcel,
  onDownloadPdf,
  onDownloadExcel,
  onSave,
  saving,
  readOnly,
}: SaveActionsBarProps) => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const accentActionButtonClass = isAndroidPlatform
    ? 'h-11 min-w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 px-4 text-[16px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
    : 'h-10 min-w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 px-4 text-[15px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';

  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-md border bg-white p-3 sm:flex-row sm:items-center">
      <div className="space-y-1">
        <div className="text-sm text-slate-600">Secciones completas: {completedSections}</div>
        <div className="text-sm text-slate-600">Horas totales mano de obra: {totalWorkforceHours.toFixed(2)}</div>
        <div className="text-sm text-slate-600">Estado seleccionado: {saveStatusSummaryLabel}</div>
      </div>
      <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
        <Button variant="outline" onClick={onDownloadPdf} disabled={exportingPdf || exportingExcel}>
          <Download className="mr-2 h-4 w-4" />
          {exportingPdf ? 'Generando...' : 'PDF'}
        </Button>
        <Button variant="outline" onClick={onDownloadExcel} disabled={exportingPdf || exportingExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {exportingExcel ? 'Generando...' : 'Excel'}
        </Button>
        <Button
          variant="outline"
          onClick={onSave}
          disabled={saving || readOnly}
          className={accentActionButtonClass}
        >
          <Save className="mr-2 h-4 w-4" />
          {readOnly ? 'Solo lectura' : saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
};

export type { SaveActionsBarProps };
