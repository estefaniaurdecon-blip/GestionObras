import { useState } from 'react';
import { useCompanyStandardization, SimilarGroup } from '@/hooks/useCompanyStandardization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Building2,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Settings2
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const SOURCE_LABELS: Record<string, string> = {
  'subcontrata': 'Subcontrata',
  'proveedor_material': 'Proveedor',
  'maquinaria': 'Maquinaria',
  'mano_obra': 'Mano de obra',
  'alquiler': 'Alquiler',
  'asignacion_alquiler': 'Asignación',
  'cartera': 'Cartera'
};

const SOURCE_COLORS: Record<string, string> = {
  'subcontrata': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'proveedor_material': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'maquinaria': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'mano_obra': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'alquiler': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'asignacion_alquiler': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'cartera': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
};

interface GroupCardProps {
  group: SimilarGroup;
  groupIndex: number;
  onSelectCanonical: (index: number, name: string) => void;
  onApply: (group: SimilarGroup) => void;
  applying: boolean;
}

const GroupCard = ({ group, groupIndex, onSelectCanonical, onApply, applying }: GroupCardProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              {group.selectedCanonical || group.canonicalName}
            </CardTitle>
            <CardDescription className="mt-1">
              {group.variations.length} variaciones encontradas • {group.totalCount} apariciones totales
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Ocultar' : 'Ver detalles'}
          </Button>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="space-y-4">
          <RadioGroup
            value={group.selectedCanonical || group.canonicalName}
            onValueChange={(value) => onSelectCanonical(groupIndex, value)}
            className="space-y-2"
          >
            {group.variations.map((variation, varIndex) => (
              <div
                key={varIndex}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <RadioGroupItem value={variation.name} id={`${groupIndex}-${varIndex}`} />
                  <Label
                    htmlFor={`${groupIndex}-${varIndex}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium">{variation.name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {variation.sources.map((source, sIdx) => (
                        <Badge
                          key={sIdx}
                          variant="secondary"
                          className={`text-xs ${SOURCE_COLORS[source] || ''}`}
                        >
                          {SOURCE_LABELS[source] || source}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        ({variation.count} veces)
                      </span>
                    </div>
                  </Label>
                </div>
                {(group.selectedCanonical || group.canonicalName) === variation.name && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </div>
            ))}
          </RadioGroup>

          <div className="flex items-center gap-2 pt-2 border-t">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Todas las variaciones se convertirán a:
            </span>
            <span className="font-medium">
              {group.selectedCanonical || group.canonicalName}
            </span>
          </div>

          <Button
            onClick={() => onApply(group)}
            disabled={applying}
            className="w-full"
          >
            {applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aplicando...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Aplicar a este grupo
              </>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
};

export const CompanyStandardization = () => {
  const {
    analyzing,
    applying,
    analysisResult,
    analyzeCompanies,
    updateCanonicalName,
    applyStandardization,
    applySingleGroup,
    clearResults
  } = useCompanyStandardization();

  const [threshold, setThreshold] = useState(70);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleAnalyze = () => {
    analyzeCompanies(threshold / 100);
  };

  const handleApplyAll = () => {
    setShowConfirmDialog(true);
  };

  const confirmApplyAll = async () => {
    await applyStandardization();
    setShowConfirmDialog(false);
  };

  const totalChanges = analysisResult?.groups.reduce((sum, group) => {
    return sum + group.variations.length - 1; // -1 because canonical name doesn't change
  }, 0) || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Estandarización de Nombres de Empresas
          </CardTitle>
          <CardDescription>
            Detecta y corrige inconsistencias en los nombres de empresas proveedoras y subcontratas
            para mejorar la calidad de los datos y la precisión de los informes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sensibilidad de detección: {threshold}%</Label>
              <span className="text-xs text-muted-foreground">
                {threshold < 60 ? 'Muy estricto' : threshold < 80 ? 'Moderado' : 'Flexible'}
              </span>
            </div>
            <Slider
              value={[threshold]}
              onValueChange={([value]) => setThreshold(value)}
              min={50}
              max={95}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Un valor más alto detectará más similitudes (puede incluir falsos positivos).
              Un valor más bajo será más estricto.
            </p>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Analizar nombres de empresas
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {analysisResult && (
        <>
          <Alert variant={analysisResult.duplicateGroups > 0 ? "default" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Resultado del análisis</AlertTitle>
            <AlertDescription>
              Se analizaron <strong>{analysisResult.totalCompanies}</strong> empresas únicas.
              {analysisResult.duplicateGroups > 0 ? (
                <>
                  {' '}Se encontraron <strong>{analysisResult.duplicateGroups}</strong> grupos
                  con nombres similares que podrían ser la misma empresa.
                </>
              ) : (
                ' No se encontraron duplicados.'
              )}
            </AlertDescription>
          </Alert>

          {analysisResult.duplicateGroups > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Grupos de empresas similares
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={clearResults}
                    size="sm"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Limpiar
                  </Button>
                  <Button
                    onClick={handleApplyAll}
                    disabled={applying}
                    size="sm"
                  >
                    {applying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Aplicando...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Aplicar todos ({totalChanges} cambios)
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[600px] pr-4">
                {analysisResult.groups.map((group, index) => (
                  <GroupCard
                    key={index}
                    group={group}
                    groupIndex={index}
                    onSelectCanonical={updateCanonicalName}
                    onApply={applySingleGroup}
                    applying={applying}
                  />
                ))}
              </ScrollArea>
            </>
          )}
        </>
      )}

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar estandarización</DialogTitle>
            <DialogDescription>
              Esta acción actualizará <strong>{totalChanges}</strong> nombres de empresas
              en todos los partes de trabajo, alquileres y cartera de empresas.
              <br /><br />
              <strong>Esta acción no se puede deshacer.</strong> ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmApplyAll} disabled={applying}>
              {applying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aplicando...
                </>
              ) : (
                'Confirmar y aplicar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
