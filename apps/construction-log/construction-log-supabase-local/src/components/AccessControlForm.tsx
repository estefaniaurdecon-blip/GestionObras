import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Users,
  Truck,
  Plus,
  Edit,
  Trash2,
  FileText,
} from "lucide-react";
import { AccessReport, AccessEntry } from "@/types/accessControl";
import {
  buildAccessControlPdfFilename,
  generateAccessControlPDF,
} from "@/utils/accessControlPdfGenerator";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { SignaturePad } from "./SignaturePad";
import { useAssignedWorks } from "@/hooks/useAssignedWorks";
import { storage } from "@/utils/storage";
import { CopyAccessControlDataDialog } from "./CopyAccessControlDataDialog";
import {
  downloadExportFiles,
  getExportDirectoryLabel,
  isNativeExportPlatform,
  isShareCancellationError,
  shareExportFiles,
} from "@/services/workReportExportInfrastructure";

interface AccessControlFormProps {
  report?: AccessReport;
  allReports?: AccessReport[];
  onSave: (report: AccessReport) => Promise<void>;
  onBack: () => void;
  companyLogo?: string;
  onSaved?: () => void;
}

const isAndroidPlatform = Capacitor.getPlatform() === "android";
const lightButtonClass = isAndroidPlatform
  ? "h-11 px-4 justify-center border-slate-200 bg-slate-50 text-[16px] font-medium text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900"
  : "h-10 px-4 justify-center border-slate-200 bg-slate-50 text-[15px] font-medium text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900 sm:h-11 sm:text-base";
const fieldLabelClass = isAndroidPlatform
  ? "text-[16px] font-medium text-slate-700"
  : "text-[15px] font-medium text-slate-700 sm:text-[16px]";
const sectionDescriptionClass = isAndroidPlatform
  ? "text-[16px] text-muted-foreground"
  : "text-[15px] text-muted-foreground sm:text-[16px]";
const emptyStateClass = isAndroidPlatform
  ? "py-8 text-center text-[16px] text-muted-foreground"
  : "py-8 text-center text-[15px] text-muted-foreground sm:text-[16px]";
const entryTitleClass = isAndroidPlatform
  ? "truncate text-[16px] font-semibold text-slate-900 leading-snug"
  : "truncate text-[15px] font-medium text-slate-900 sm:text-[16px]";
const entryMetaClass = isAndroidPlatform
  ? "text-[15px] text-muted-foreground leading-snug"
  : "text-[15px] text-muted-foreground sm:text-[16px]";
const entryWarningClass = isAndroidPlatform
  ? "text-[15px] font-medium text-destructive leading-snug"
  : "text-[15px] font-medium text-destructive sm:text-[16px]";
const modalTitleClass = isAndroidPlatform
  ? "text-xl font-semibold text-slate-900"
  : "text-lg font-semibold text-slate-900 sm:text-xl";
const modalDescriptionClass = isAndroidPlatform
  ? "text-[16px] text-muted-foreground"
  : "text-[15px] text-muted-foreground sm:text-[16px]";
const accentActionButtonClass = isAndroidPlatform
  ? "h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800"
  : "h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800";

export const AccessControlForm = ({
  report,
  allReports = [],
  onSave,
  onBack,
  companyLogo,
  onSaved,
}: AccessControlFormProps) => {
  const { organization } = useOrganization();
  const { works } = useAssignedWorks();
  const draftReportIdRef = useRef(report?.id || crypto.randomUUID());
  const draftCreatedAtRef = useRef(report?.createdAt || new Date().toISOString());
  const [formData, setFormData] = useState<
    Omit<AccessReport, "id" | "createdAt" | "updatedAt">
  >({
    date: new Date().toISOString().split("T")[0],
    siteName: "",
    workId: undefined,
    responsible: "",
    responsibleEntryTime: "",
    responsibleExitTime: "",
    observations: "",
    personalEntries: [],
    machineryEntries: [],
  });

  // Estado inicial para detectar cambios sin guardar
  const [initialFormData, setInitialFormData] = useState(formData);
  const [hasBeenSaved, setHasBeenSaved] = useState(false);

  // Detectar si hay cambios sin guardar
  const hasUnsavedChanges =
    !hasBeenSaved &&
    (formData.siteName !== initialFormData.siteName ||
      formData.workId !== initialFormData.workId ||
      formData.responsible !== initialFormData.responsible ||
      formData.observations !== initialFormData.observations ||
      JSON.stringify(formData.personalEntries) !==
        JSON.stringify(initialFormData.personalEntries) ||
      JSON.stringify(formData.machineryEntries) !==
        JSON.stringify(initialFormData.machineryEntries));

  // Hook para prevenir pérdida de datos
  useUnsavedChanges({ hasUnsavedChanges });

  const [editingPersonal, setEditingPersonal] = useState<AccessEntry | null>(
    null
  );
  const [editingMachinery, setEditingMachinery] = useState<AccessEntry | null>(
    null
  );
  const { toast } = useToast();

  useEffect(() => {
    draftReportIdRef.current = report?.id || crypto.randomUUID();
    draftCreatedAtRef.current = report?.createdAt || new Date().toISOString();
  }, [report?.createdAt, report?.id]);

  const buildReportForSave = useCallback(
    (): AccessReport => ({
      id: report?.id || draftReportIdRef.current,
      ...formData,
      createdAt: report?.createdAt || draftCreatedAtRef.current,
      updatedAt: new Date().toISOString(),
    }),
    [formData, report?.createdAt, report?.id]
  );

  // Cargar borrador guardado al montar el componente
  useEffect(() => {
    const loadDraft = async () => {
      if (report) {
        // Si estamos editando un reporte existente, cargar sus datos
        const reportData = {
          date: report.date,
          siteName: report.siteName,
          workId: report.workId,
          responsible: report.responsible,
          responsibleEntryTime: report.responsibleEntryTime || "",
          responsibleExitTime: report.responsibleExitTime || "",
          observations: report.observations,
          personalEntries: report.personalEntries,
          machineryEntries: report.machineryEntries,
        };
        setFormData(reportData);
        setInitialFormData(reportData);

        // Intentar cargar borrador específico del reporte si existe
        try {
          const draftKey = `access_control_draft_${report.id}`;
          const savedDraft = await storage.getItem(draftKey);
          if (savedDraft) {
            const draft = JSON.parse(savedDraft);
            console.log(
              "[AccessControl] Borrador específico recuperado:",
              draft
            );
            setFormData(draft);
            toast({
              title: "Cambios no guardados recuperados",
              description:
                "Se han restaurado los cambios no guardados de este control.",
            });
          }
        } catch (error) {
          console.error("[AccessControl] Error loading specific draft:", error);
        }
      } else {
        // Si es un nuevo reporte, intentar cargar el borrador guardado
        try {
          const draftKey = "access_control_draft";
          const savedDraft = await storage.getItem(draftKey);
          if (savedDraft) {
            const draft = JSON.parse(savedDraft);
            console.log("[AccessControl] Borrador recuperado:", draft);
            setFormData(draft);
            setInitialFormData(draft);
            toast({
              title: "Borrador recuperado",
              description:
                "Se han restaurado los datos no guardados del último control de accesos.",
            });
          }
        } catch (error) {
          console.error("[AccessControl] Error loading draft:", error);
        }
      }
    };
    loadDraft();
  }, [report, toast]);

  // Auto-seleccionar obra si solo hay una asignada
  useEffect(() => {
    if (!report && works.length === 1 && !formData.workId) {
      const work = works[0];
      setFormData((prev) => ({
        ...prev,
        workId: work.id,
        siteName: `${work.number} - ${work.name}`,
      }));
      setInitialFormData((prev) => ({
        ...prev,
        workId: work.id,
        siteName: `${work.number} - ${work.name}`,
      }));
    }
  }, [works, report, formData.workId]);

  // Autoguardar borrador local rápido (1 segundo)
  useEffect(() => {
    if (hasUnsavedChanges) {
      const saveDraft = async () => {
        try {
          const draftKey = report
            ? `access_control_draft_${report.id}`
            : "access_control_draft";
          await storage.setItem(draftKey, JSON.stringify(formData));
          console.log("[AccessControl] Borrador local guardado");
        } catch (error) {
          console.error("[AccessControl] Error saving local draft:", error);
        }
      };

      const timeoutId = setTimeout(saveDraft, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, report, hasUnsavedChanges]);

  // Autoguardar en base de datos cada 30 segundos si hay datos mínimos
  useEffect(() => {
    const hasMinimumData =
      formData.siteName.trim() !== "" && formData.responsible.trim() !== "";

    if (hasMinimumData && hasUnsavedChanges) {
      const saveToDatabase = async () => {
        try {
          const accessReport = buildReportForSave();

          console.log("[AccessControl] Autoguardando en base de datos...");
          await onSave(accessReport);

          // Actualizar estado inicial para marcar como guardado
          setInitialFormData(formData);
          setHasBeenSaved(true);

          // Limpiar borrador local tras guardar en BD
          const draftKey = report
            ? `access_control_draft_${report.id}`
            : "access_control_draft";
          await storage.removeItem(draftKey);
          console.log(
            "[AccessControl] Autoguardado completado y borrador limpiado"
          );
        } catch (error) {
          console.error("[AccessControl] Error en autoguardado:", error);
        }
      };

      // Autoguardar cada 30 segundos
      const intervalId = setInterval(saveToDatabase, 30000);
      return () => clearInterval(intervalId);
    }
  }, [buildReportForSave, formData, hasUnsavedChanges, onSave, report]);

  const handleSave = async () => {
    if (!formData.siteName.trim() || !formData.responsible.trim()) {
      toast({
        title: "Campos requeridos",
        description:
          "Por favor, completa el nombre de la obra y el responsable.",
        variant: "destructive",
      });
      return;
    }

    const accessReport = buildReportForSave();

    try {
      // Guardar en base de datos
      await onSave(accessReport);

      // Marcar como guardado para resetear tracking de cambios
      setHasBeenSaved(true);
      setInitialFormData(formData);

      // Limpiar borrador después de guardar exitosamente
      const draftKey = report
        ? `access_control_draft_${report.id}`
        : "access_control_draft";
      await storage.removeItem(draftKey);
      console.log(
        "[AccessControl] Guardado manual completado y borrador limpiado"
      );

      toast({
        title: "Guardado exitoso",
        description:
          "El control de acceso se ha guardado correctamente en la base de datos.",
      });
      onSaved?.();
    } catch (error) {
      console.error("[AccessControl] Error al guardar:", error);
      toast({
        title: "Error al guardar",
        description:
          "No se pudo guardar el control de acceso. Se mantendrá el borrador local.",
        variant: "destructive",
      });
    }
  };

  const handleGeneratePDF = async () => {
    if (!formData.siteName.trim()) {
      toast({
        title: "Datos incompletos",
        description:
          "Necesitas al menos el nombre de la obra para generar el PDF.",
        variant: "destructive",
      });
      return;
    }

    const accessReport = buildReportForSave();

    try {
      const brandColor = organization?.brand_color || undefined;
      const pdfBlob = (await generateAccessControlPDF(
        accessReport,
        companyLogo,
        brandColor,
        true
      )) as Blob;
      const filename = buildAccessControlPdfFilename(accessReport);
      const files = [{ filename, blob: pdfBlob }];
      const downloadResult = await downloadExportFiles(files);
      const nativeDirectory = downloadResult.directory;
      const exportedDescription = nativeDirectory
        ? `Se guardó el PDF en ${getExportDirectoryLabel(nativeDirectory)}.`
        : "Se descargó el PDF del control de accesos.";

      if (!isNativeExportPlatform()) {
        toast({
          title: "PDF exportado",
          description: exportedDescription,
        });
        return;
      }

      toast({
        title: "PDF exportado",
        description: `${exportedDescription} ¿Quieres compartirlo?`,
        duration: Infinity,
        action: (
          <ToastAction
            altText="Compartir PDF exportado"
            onClick={() => {
              void (async () => {
                try {
                  await shareExportFiles({
                    files,
                    title: "Control de accesos en PDF",
                    text: "Control de accesos exportado",
                    savedUris: downloadResult.uris,
                    dialogTitle: "Compartir PDF",
                  });
                  toast({
                    title: "Panel de compartir abierto",
                    description:
                      "Revisa la app elegida y pulsa Enviar para completar el envío.",
                  });
                } catch (error) {
                  if (isShareCancellationError(error)) return;
                  console.error(
                    "[AccessControl] Error compartiendo PDF exportado:",
                    error
                  );
                  toast({
                    title: "Error al compartir",
                    description: "No se pudo compartir el PDF exportado.",
                    variant: "destructive",
                  });
                }
              })();
            }}
          >
            Compartir
          </ToastAction>
        ),
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error al generar PDF",
        description: "No se pudo generar el PDF del control de accesos.",
        variant: "destructive",
      });
    }
  };

  const addPersonalEntry = () => {
    const newEntry: AccessEntry = {
      id: crypto.randomUUID(),
      type: "personal",
      name: "",
      identifier: "",
      company: "",
      entryTime: "08:00",
      exitTime: "18:00",
      activity: "",
    };
    setEditingPersonal(newEntry);
  };

  const addMachineryEntry = () => {
    const newEntry: AccessEntry = {
      id: crypto.randomUUID(),
      type: "machinery",
      name: "",
      identifier: "",
      company: "",
      entryTime: "08:00",
      exitTime: "18:00",
      activity: "",
    };
    setEditingMachinery(newEntry);
  };

  const savePersonalEntry = (entry: AccessEntry) => {
    // Validar DNI único
    const isDniDuplicate = formData.personalEntries.some(
      (e) =>
        e.id !== entry.id &&
        e.identifier.trim() === entry.identifier.trim() &&
        entry.identifier.trim() !== ""
    );

    if (isDniDuplicate) {
      toast({
        title: "DNI duplicado",
        description:
          "Ya existe una entrada con este DNI. Cada DNI debe ser único.",
        variant: "destructive",
      });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      personalEntries:
        editingPersonal?.id &&
        prev.personalEntries.find((e) => e.id === editingPersonal.id)
          ? prev.personalEntries.map((e) => (e.id === entry.id ? entry : e))
          : [...prev.personalEntries, entry],
    }));
    setEditingPersonal(null);
  };

  const saveMachineryEntry = (entry: AccessEntry) => {
    setFormData((prev) => ({
      ...prev,
      machineryEntries:
        editingMachinery?.id &&
        prev.machineryEntries.find((e) => e.id === editingMachinery.id)
          ? prev.machineryEntries.map((e) => (e.id === entry.id ? entry : e))
          : [...prev.machineryEntries, entry],
    }));
    setEditingMachinery(null);
  };

  const deletePersonalEntry = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      personalEntries: prev.personalEntries.filter((e) => e.id !== id),
    }));
  };

  const deleteMachineryEntry = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      machineryEntries: prev.machineryEntries.filter((e) => e.id !== id),
    }));
  };

  // Handler para copiar datos de otro control de accesos
  const handleCopyData = (
    personalEntries: AccessEntry[],
    machineryEntries: AccessEntry[]
  ) => {
    setFormData((prev) => {
      // Filtrar duplicados de personal (por DNI)
      const newPersonalEntries = prev.personalEntries.filter((existing) => {
        const isDuplicate = personalEntries.some((newEntry) => {
          if (newEntry.identifier && newEntry.identifier.trim() !== "") {
            return (
              existing.identifier?.toLowerCase().trim() ===
              newEntry.identifier.toLowerCase().trim()
            );
          }
          return (
            existing.name.toLowerCase() === newEntry.name.toLowerCase() &&
            existing.company.toLowerCase() === newEntry.company.toLowerCase()
          );
        });
        return !isDuplicate;
      });

      // Filtrar duplicados de maquinaria (matrícula; si falta, nombre+operador)
      const newMachineryEntries = prev.machineryEntries.filter((existing) => {
        const normText = (v?: string) => (v ?? "").toLowerCase().trim();
        const normPlate = (v?: string) =>
          (v ?? "").toLowerCase().replace(/[\s-]/g, "").trim();

        const isDuplicate = machineryEntries.some((newEntry) => {
          const newPlate = normPlate(newEntry.identifier);
          const existingPlate = normPlate(existing.identifier);

          // Si ambos tienen matrícula, es el criterio principal
          if (newPlate && existingPlate) {
            return existingPlate === newPlate;
          }

          // Si falta matrícula en alguno, usar nombre + operador
          return (
            normText(existing.name) === normText(newEntry.name) &&
            normText(existing.operator) === normText(newEntry.operator)
          );
        });

        return !isDuplicate;
      });

      return {
        ...prev,
        personalEntries: [...newPersonalEntries, ...personalEntries],
        machineryEntries: [...newMachineryEntries, ...machineryEntries],
      };
    });

    toast({
      title: "Datos copiados",
      description: `Se han copiado ${personalEntries.length} registros de personal y ${machineryEntries.length} de maquinaria.`,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-8 text-[15px]">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white/70 px-4 py-5 shadow-sm backdrop-blur-sm sm:px-6">
        <div className="relative flex w-full justify-center">
          <Button
            variant="ghost"
            onClick={onBack}
            size="sm"
            className="-ml-3 absolute left-0 top-0 h-9 border-0 px-2 text-slate-600 shadow-none hover:bg-transparent hover:text-slate-900 sm:ml-0"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span>Volver</span>
          </Button>
          <div className="flex flex-col items-center gap-1 px-14 text-center">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-3xl">
              {report ? "Editar control de accesos" : "Nuevo registro"}
            </h1>
            <p className="text-[15px] text-muted-foreground">
              Control de accesos
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:px-16">
            <CopyAccessControlDataDialog
              reports={allReports}
              currentReportId={report?.id}
              currentPersonalEntries={formData.personalEntries}
              currentMachineryEntries={formData.machineryEntries}
              onCopy={handleCopyData}
            />
            <Button
              variant="outline"
              onClick={handleGeneratePDF}
              className={`w-full sm:w-auto ${lightButtonClass}`}
            >
              <FileText className="h-4 w-4 mr-2" />
              <span>Descargar PDF</span>
            </Button>
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl font-semibold text-slate-900 sm:text-2xl">
            Sistema de Gestión de Obras
          </CardTitle>
          <CardDescription className={`text-center ${sectionDescriptionClass}`}>
            Sistema de Gestión de Obras
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date" className={fieldLabelClass}>Fecha</Label>
              <Input
                id="date"
                type="date"
                lang="es-ES"
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workId" className={fieldLabelClass}>Obra Asignada *</Label>
              <Select
                value={formData.workId || ""}
                onValueChange={(value) => {
                  const selectedWork = works.find((w) => w.id === value);
                  setFormData((prev) => ({
                    ...prev,
                    workId: value,
                    siteName: selectedWork
                      ? `${selectedWork.number} - ${selectedWork.name}`
                      : prev.siteName,
                  }));
                }}
              >
                <SelectTrigger id="workId">
                  <SelectValue placeholder="Selecciona una obra" />
                </SelectTrigger>
                <SelectContent>
                  {works.map((work) => (
                    <SelectItem key={work.id} value={work.id}>
                      {work.number} - {work.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="siteName" className={fieldLabelClass}>Nombre de Obra *</Label>
              <Input
                id="siteName"
                value={formData.siteName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, siteName: e.target.value }))
                }
                placeholder="Nombre de Obra"
                disabled={!!formData.workId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsible" className={fieldLabelClass}>Responsable *</Label>
              <Input
                id="responsible"
                value={formData.responsible}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    responsible: e.target.value,
                  }))
                }
                placeholder="Responsable"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="responsibleEntryTime" className={fieldLabelClass}>
                Hora Entrada Encargado
              </Label>
              <Input
                id="responsibleEntryTime"
                type="time"
                lang="es-ES"
                value={formData.responsibleEntryTime || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    responsibleEntryTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsibleExitTime" className={fieldLabelClass}>Hora Salida Encargado</Label>
              <Input
                id="responsibleExitTime"
                type="time"
                lang="es-ES"
                value={formData.responsibleExitTime || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    responsibleExitTime: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              <Users className="h-5 w-5" />
              Personal
            </CardTitle>
            <CardDescription className={`text-center ${sectionDescriptionClass}`}>
              Registro de acceso del personal
            </CardDescription>
            <Button
              onClick={addPersonalEntry}
              variant="outline"
              className={`w-full sm:w-auto ${lightButtonClass}`}
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir Personal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formData.personalEntries.length === 0 ? (
            <div className={emptyStateClass}>
              No hay registros de personal. Haz clic en "Añadir Personal" para
              empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {formData.personalEntries.map((entry) => {
                const isValid = entry.identifier.trim() !== "";
                const isDuplicate =
                  formData.personalEntries.filter(
                    (e) =>
                      e.identifier.trim() === entry.identifier.trim() &&
                      entry.identifier.trim() !== ""
                  ).length > 1;

                return (
                  <div
                    key={entry.id}
                    className={`p-3 border rounded-lg ${
                      !isValid || isDuplicate
                        ? "border-destructive bg-destructive/5"
                        : ""
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className={entryTitleClass}>
                          {entry.name}
                        </div>
                        <div className={entryMetaClass}>
                          {entry.identifier || (
                            <span className="text-destructive">
                              DNI no proporcionado
                            </span>
                          )}
                          {isDuplicate && (
                            <span className="text-destructive ml-2">
                              (DNI duplicado)
                            </span>
                          )}
                        </div>
                        <div className={entryMetaClass}>
                          {entry.company}
                        </div>
                        <div className={entryMetaClass}>
                          {entry.entryTime}
                          {entry.exitTime ? ` - ${entry.exitTime}` : ""}
                        </div>
                        {entry.activity && (
                          <div className={entryMetaClass}>
                            {entry.activity}
                          </div>
                        )}
                        {(!isValid || isDuplicate) && (
                          <div className={entryWarningClass}>
                            ⚠️ No se contabilizará hasta completar datos
                            correctamente
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 sm:flex-col">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingPersonal(entry)}
                          className="h-10 flex-1 sm:h-11 sm:w-11 sm:flex-none"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deletePersonalEntry(entry.id)}
                          className="h-10 flex-1 sm:h-11 sm:w-11 sm:flex-none"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Machinery Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              <Truck className="h-5 w-5" />
              Maquinaria
            </CardTitle>
            <CardDescription className={`text-center ${sectionDescriptionClass}`}>
              Registro de acceso de maquinaria
            </CardDescription>
            <Button
              onClick={addMachineryEntry}
              variant="outline"
              className={`w-full sm:w-auto ${lightButtonClass}`}
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir Máquina
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formData.machineryEntries.length === 0 ? (
            <div className={emptyStateClass}>
              No hay registros de maquinaria. Haz clic en "Añadir Máquina" para
              empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {formData.machineryEntries.map((entry) => {
                const isValid = entry.identifier.trim() !== "";

                return (
                  <div
                    key={entry.id}
                    className={`p-3 border rounded-lg ${
                      !isValid ? "border-destructive bg-destructive/5" : ""
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className={entryTitleClass}>
                          {entry.name}
                        </div>
                        <div className={entryMetaClass}>
                          {entry.identifier || (
                            <span className="text-destructive">
                              Matrícula no proporcionada
                            </span>
                          )}
                        </div>
                        <div className={entryMetaClass}>
                          {entry.company}
                        </div>
                        <div className={entryMetaClass}>
                          {entry.entryTime}
                          {entry.exitTime ? ` - ${entry.exitTime}` : ""}
                        </div>
                        {entry.operator && (
                          <div className={entryMetaClass}>
                            Operador: {entry.operator}
                          </div>
                        )}
                        {entry.activity && (
                          <div className={entryMetaClass}>
                            {entry.activity}
                          </div>
                        )}
                        {!isValid && (
                          <div className={entryWarningClass}>
                            ⚠️ No se contabilizará hasta completar la matrícula
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 sm:flex-col">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingMachinery(entry)}
                          className="h-10 flex-1 sm:h-11 sm:w-11 sm:flex-none"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMachineryEntry(entry.id)}
                          className="h-10 flex-1 sm:h-11 sm:w-11 sm:flex-none"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Observations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl font-semibold text-slate-900 sm:text-2xl">
            Observaciones
          </CardTitle>
          <CardDescription className={`text-center ${sectionDescriptionClass}`}>
            Notas adicionales sobre el control de accesos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.observations}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, observations: e.target.value }))
            }
            placeholder="Observaciones, incidencias o notas adicionales..."
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={handleSave}
          className={`w-full sm:w-auto ${accentActionButtonClass}`}
        >
          <Save className="h-4 w-4 mr-2" />
          <span>Guardar</span>
        </Button>
      </div>

      {/* Entry Modals would go here - simplified for this implementation */}
      {editingPersonal && (
        <PersonalEntryForm
          entry={editingPersonal}
          onSave={savePersonalEntry}
          onCancel={() => setEditingPersonal(null)}
        />
      )}

      {editingMachinery && (
        <MachineryEntryForm
          entry={editingMachinery}
          onSave={saveMachineryEntry}
          onCancel={() => setEditingMachinery(null)}
        />
      )}
    </div>
  );
};

// Personal Entry Form Component
const PersonalEntryForm = ({
  entry,
  onSave,
  onCancel,
}: {
  entry: AccessEntry;
  onSave: (entry: AccessEntry) => void;
  onCancel: () => void;
}) => {
  const { toast } = useToast();
  const [formEntry, setFormEntry] = useState(entry);

  const handleSave = () => {
    if (!formEntry.name.trim() || !formEntry.company.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Nombre y empresa son obligatorios.",
        variant: "destructive",
      });
      return;
    }

    if (!formEntry.identifier.trim()) {
      toast({
        title: "DNI requerido",
        description: "El DNI es obligatorio para registrar al personal.",
        variant: "destructive",
      });
      return;
    }

    onSave(formEntry);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={modalTitleClass}>Registro de Personal</DialogTitle>
          <DialogDescription className={modalDescriptionClass}>
            Completa los datos de acceso y recoge la firma en una ventana
            amplia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="personal-entry-name" className={fieldLabelClass}>Nombre *</Label>
              <Input
                id="personal-entry-name"
                value={formEntry.name}
                onChange={(e) =>
                  setFormEntry((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nombre completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personal-entry-dni" className={fieldLabelClass}>DNI *</Label>
              <Input
                id="personal-entry-dni"
                value={formEntry.identifier}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    identifier: e.target.value,
                  }))
                }
                placeholder="DNI"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personal-entry-company" className={fieldLabelClass}>Empresa *</Label>
            <Input
              id="personal-entry-company"
              value={formEntry.company}
              onChange={(e) =>
                setFormEntry((prev) => ({ ...prev, company: e.target.value }))
              }
              placeholder="Nombre de la empresa"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="personal-entry-start" className={fieldLabelClass}>Hora Entrada</Label>
              <Input
                id="personal-entry-start"
                type="time"
                lang="es-ES"
                value={formEntry.entryTime}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    entryTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personal-entry-end" className={fieldLabelClass}>
                Hora Salida (Est. 18:00)
              </Label>
              <Input
                id="personal-entry-end"
                type="time"
                lang="es-ES"
                value={formEntry.exitTime || "18:00"}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    exitTime: e.target.value || undefined,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personal-entry-activity" className={fieldLabelClass}>Actividad/Puesto</Label>
            <Input
              id="personal-entry-activity"
              value={formEntry.activity}
              onChange={(e) =>
                setFormEntry((prev) => ({
                  ...prev,
                  activity: e.target.value,
                }))
              }
              placeholder="Actividad o puesto de trabajo"
            />
          </div>

          <SignaturePad
            value={formEntry.signature}
            onChange={(signature) =>
              setFormEntry((prev) => ({ ...prev, signature }))
            }
            label="Firma"
          />
        </div>

        <DialogFooter className="pt-2 sm:justify-between sm:space-x-0">
          <Button
            variant="outline"
            onClick={onCancel}
            className={`w-full sm:w-[48%] ${lightButtonClass}`}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            className={`w-full sm:w-[48%] ${lightButtonClass}`}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Machinery Entry Form Component
const MachineryEntryForm = ({
  entry,
  onSave,
  onCancel,
}: {
  entry: AccessEntry;
  onSave: (entry: AccessEntry) => void;
  onCancel: () => void;
}) => {
  const { toast } = useToast();
  const [formEntry, setFormEntry] = useState(entry);

  const handleSave = () => {
    if (!formEntry.name.trim() || !formEntry.company.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Tipo de máquina y empresa son obligatorios.",
        variant: "destructive",
      });
      return;
    }

    if (!formEntry.identifier.trim()) {
      toast({
        title: "Matrícula requerida",
        description: "La matrícula o número de máquina es obligatorio.",
        variant: "destructive",
      });
      return;
    }

    onSave(formEntry);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={modalTitleClass}>Registro de Maquinaria</DialogTitle>
          <DialogDescription className={modalDescriptionClass}>
            Ventana ampliada para registrar maquinaria con el mismo formato de
            popup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machinery-entry-name" className={fieldLabelClass}>Tipo de Máquina *</Label>
              <Input
                id="machinery-entry-name"
                value={formEntry.name}
                onChange={(e) =>
                  setFormEntry((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Excavadora, grúa, camión..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machinery-entry-id" className={fieldLabelClass}>Matrícula *</Label>
              <Input
                id="machinery-entry-id"
                value={formEntry.identifier}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    identifier: e.target.value,
                  }))
                }
                placeholder="Matrícula o identificación"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="machinery-entry-company" className={fieldLabelClass}>Empresa *</Label>
            <Input
              id="machinery-entry-company"
              value={formEntry.company}
              onChange={(e) =>
                setFormEntry((prev) => ({ ...prev, company: e.target.value }))
              }
              placeholder="Nombre de la empresa"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machinery-entry-start" className={fieldLabelClass}>Hora Entrada</Label>
              <Input
                id="machinery-entry-start"
                type="time"
                lang="es-ES"
                value={formEntry.entryTime}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    entryTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machinery-entry-end" className={fieldLabelClass}>
                Hora Salida (Est. 18:00)
              </Label>
              <Input
                id="machinery-entry-end"
                type="time"
                lang="es-ES"
                value={formEntry.exitTime || "18:00"}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    exitTime: e.target.value || undefined,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machinery-entry-operator" className={fieldLabelClass}>Operador</Label>
              <Input
                id="machinery-entry-operator"
                value={formEntry.operator || ""}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    operator: e.target.value,
                  }))
                }
                placeholder="Nombre del operador"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machinery-entry-activity" className={fieldLabelClass}>Actividad</Label>
              <Input
                id="machinery-entry-activity"
                value={formEntry.activity}
                onChange={(e) =>
                  setFormEntry((prev) => ({
                    ...prev,
                    activity: e.target.value,
                  }))
                }
                placeholder="Actividad realizada"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 sm:justify-between sm:space-x-0">
          <Button
            variant="outline"
            onClick={onCancel}
            className={`w-full sm:w-[48%] ${lightButtonClass}`}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            className={`w-full sm:w-[48%] ${lightButtonClass}`}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
