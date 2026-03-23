import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { prepareOfflineTenantScope } from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import { executeWorkReportImport, type ImportConflictPolicy } from '@/services/workReportImportService';
import { FileInput, Loader2 } from 'lucide-react';
import { ToolsOptionButton } from './toolsPanelShared';

export const DataManagementImportDialog = ({
  disabled,
  onDataChanged,
}: {
  disabled: boolean;
  onDataChanged: () => Promise<void>;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [pendingConflictCount, setPendingConflictCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
  };

  const handleImport = async (selectedConflictPolicy?: ImportConflictPolicy) => {
    if (selectedFiles.length === 0) return;
    setImporting(true);

    try {
      const tenantId = await prepareOfflineTenantScope(user);
      const existingReports = await workReportsRepo.list({ tenantId, limit: 5000 });
      const importResult = await executeWorkReportImport({
        tenantId,
        existingReports,
        files: selectedFiles,
        selectedConflictPolicy,
        createReport: (draft) => workReportsRepo.create(draft),
        updateReport: (id, patch) => workReportsRepo.update(id, patch),
      });

      if (importResult.reportsToImportCount === 0) {
        toast({
          title: 'Importacion sin cambios',
          description: 'No se encontraron partes validos en los archivos seleccionados.',
          variant: 'destructive',
        });
        return;
      }

      if (importResult.requiresConflictResolution) {
        setPendingConflictCount(importResult.conflictMatchesCount);
        return;
      }

      await onDataChanged();

      const errorsSummary =
        importResult.invalidFilesCount > 0 || importResult.invalidReportsCount > 0
          ? ` (archivos invalidos: ${importResult.invalidFilesCount}, partes invalidos: ${importResult.invalidReportsCount})`
          : '';
      const conflictSummary =
        importResult.conflictMatchesCount > 0
          ? ` Conflictos de identificador: ${importResult.conflictMatchesCount}.`
          : '';
      const importSummary = `Nuevos: ${importResult.createdCount}. Sobrescritos: ${importResult.overwrittenCount}. Identificador cambiado: ${importResult.renumberedCount}.`;

      toast({
        title: 'Importacion completada',
        description: `Se procesaron ${importResult.importedCount} parte(s). ${importSummary}${conflictSummary}${errorsSummary}`,
      });

      setPendingConflictCount(null);
      resetFiles();
      setOpen(false);
    } catch (error) {
      console.error('[DataManagementImportDialog] Error importando datos JSON:', error);
      toast({
        title: 'Error al importar',
        description: 'No se pudieron importar los archivos JSON.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      resetFiles();
      setImporting(false);
      setPendingConflictCount(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolsOptionButton
          icon={<FileInput className="h-8 w-8 text-indigo-600" />}
          label="Importar datos"
          disabled={disabled}
          onClick={() => setOpen(true)}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar datos</DialogTitle>
          <DialogDescription>
            Selecciona uno o varios archivos JSON para crear o actualizar partes con su informacion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />

          <Button type="button" variant="outline" onClick={handlePickFiles} disabled={importing}>
            Seleccionar archivos JSON
          </Button>

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Archivos seleccionados: {selectedFiles.length}
          </div>
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Si un identificador ya existe, se mostrara un aviso para elegir entre sobrescribir o cambiar identificador.
          </div>

          {selectedFiles.length > 0 ? (
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-2">
              {selectedFiles.map((file) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-700"
                  title={file.name}
                >
                  {file.name}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
            onClick={() => void handleImport()}
            disabled={selectedFiles.length === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              'Importar JSON'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={pendingConflictCount !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !importing) {
            setPendingConflictCount(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parte ya existente</DialogTitle>
            <DialogDescription>
              Se detectaron {pendingConflictCount ?? 0} conflicto(s) de identificador. Elige como continuar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingConflictCount(null)}
              disabled={importing}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleImport('renumber')}
              disabled={importing}
            >
              Cambiar identificador
            </Button>
            <Button
              type="button"
              className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
              onClick={() => void handleImport('overwrite')}
              disabled={importing}
            >
              Sobrescribir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
