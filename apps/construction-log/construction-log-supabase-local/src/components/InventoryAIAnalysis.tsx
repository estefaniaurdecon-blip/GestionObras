import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { analyzeInventory, applyInventoryAnalysis, mergeInventorySuppliers } from '@/integrations/api/client';

interface AnalysisResult {
  item_id: string;
  original_name: string;
  action: 'delete' | 'update' | 'keep';
  reason: string;
  suggested_changes?: {
    item_type?: string;
    category?: string;
    unit?: string;
    name?: string;
  };
}

interface DuplicateSupplier {
  suppliers: string[];
  item_count: number;
  reason: string;
  normalized_name: string;
}

interface InventoryAIAnalysisProps {
  workId: string;
  onAnalysisComplete?: () => void;
}

export const InventoryAIAnalysis = ({ workId, onAnalysisComplete }: InventoryAIAnalysisProps) => {
  const { t } = useTranslation();
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [duplicateSuppliers, setDuplicateSuppliers] = useState<DuplicateSupplier[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setResults([]);
    setShowResults(false);

    try {
      const data = await analyzeInventory({ work_id: workId });

      if (data.success) {
        setResults(data.results || []);
        setDuplicateSuppliers(data.duplicate_suppliers || []);
        
        // Initialize selected suppliers (default to first option)
        const initialSelections: Record<number, string> = {};
        (data.duplicate_suppliers || []).forEach((dup: DuplicateSupplier, index: number) => {
          initialSelections[index] = dup.suppliers[0];
        });
        setSelectedSuppliers(initialSelections);
        
        setShowResults(true);
        
        const analysisMsg = data.total_analyzed === 50 
          ? `Se analizaron los primeros 50 items del inventario (máximo por análisis).`
          : `Se analizaron ${data.total_analyzed} items.`;
        
        const supplierMsg = data.duplicate_suppliers?.length 
          ? ` Se detectaron ${data.duplicate_suppliers.length} grupos de proveedores duplicados.`
          : '';
        
        toast({
          title: "Análisis completado",
          description: `${analysisMsg}${supplierMsg} Revisa los resultados.`,
        });
      } else {
        throw new Error(data.message || 'Error en el análisis');
      }
    } catch (error: any) {
      console.error('Error analyzing inventory:', error);
      toast({
        title: "Error en análisis",
        description: error.message || 'No se pudo completar el análisis con IA',
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUnifySuppliers = async () => {
    setApplying(true);
    let unifiedInReportsCount = 0;
    let unifiedInInventoryCount = 0;

    try {
      for (const [index, duplicate] of duplicateSuppliers.entries()) {
        const keepSupplier = selectedSuppliers[index];
        const suppliersToRemove = duplicate.suppliers.filter((s) => s !== keepSupplier);

        if (!keepSupplier || suppliersToRemove.length === 0) continue;

        const response = await mergeInventorySuppliers({
          work_id: workId,
          target_supplier: keepSupplier,
          suppliers_to_merge: suppliersToRemove,
          update_report_material_groups: true,
        });

        unifiedInReportsCount += response.reportGroupsUpdated || 0;
        unifiedInInventoryCount += response.inventoryUpdated || 0;
      }

      toast({
        title: "Proveedores unificados exitosamente",
        description: `${unifiedInReportsCount} albaranes y ${unifiedInInventoryCount} items de inventario actualizados`,
      });

      setDuplicateSuppliers([]);
      setSelectedSuppliers({});

      if (onAnalysisComplete) {
        await onAnalysisComplete();
      }
    } catch (error: any) {
      console.error('Error unifying suppliers:', error);
      toast({
        title: "Error al unificar proveedores",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };
  const handleApplyChanges = async () => {
    setApplying(true);

    try {
      const validResults = results
        .filter((result) => {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(result.item_id);
        })
        .map((result) => ({
          item_id: result.item_id,
          action: result.action,
          suggested_changes: result.suggested_changes,
        }));

      const response = await applyInventoryAnalysis({
        work_id: workId,
        results: validResults,
      });

      const deletedCount = response.deletedCount || 0;
      const updatedCount = response.updatedCount || 0;
      const errorCount = response.errorCount || 0;
      const errors = response.errors || [];

      if (errorCount > 0) {
        toast({
          title: "Cambios aplicados con advertencias",
          description: `${deletedCount} eliminados, ${updatedCount} actualizados, ${errorCount} omitidos por conflictos.`,
          variant: "default",
        });
        console.warn('Items omitidos por conflictos:', errors);
      } else {
        toast({
          title: "Cambios aplicados exitosamente",
          description: `${deletedCount} items eliminados, ${updatedCount} items actualizados. Recargando inventario...`,
        });
      }

      setResults([]);
      setShowResults(false);

      await new Promise(resolve => setTimeout(resolve, 500));

      if (onAnalysisComplete) {
        await onAnalysisComplete();
      }

      if (errorCount === 0) {
        toast({
          title: "Inventario actualizado",
          description: "Todos los cambios se aplicaron correctamente",
        });
      }
    } catch (error: any) {
      console.error('Error applying changes:', error);
      toast({
        title: "Error aplicando cambios",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'delete': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'update': return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'keep': return <CheckCircle className="h-5 w-5 text-success" />;
      default: return <Info className="h-5 w-5" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'delete': return <Badge variant="destructive">Eliminar</Badge>;
      case 'update': return <Badge variant="secondary">Actualizar</Badge>;
      case 'keep': return <Badge variant="outline">Mantener</Badge>;
      default: return null;
    }
  };

  const deleteCount = results.filter(r => r.action === 'delete').length;
  const updateCount = results.filter(r => r.action === 'update').length;
  const keepCount = results.filter(r => r.action === 'keep').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AnÃ¡lisis de Inventario con IA
        </CardTitle>
        <CardDescription>
          La IA analizarÃ¡ el inventario para clasificar correctamente materiales y herramientas, 
          corregir valores errÃ³neos y eliminar maquinaria incorrectamente categorizada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showResults && (
          <Button 
            onClick={handleAnalyze} 
            disabled={analyzing}
            className="w-full"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analizando inventario...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Iniciar AnÃ¡lisis Exhaustivo
              </>
            )}
          </Button>
        )}

        {duplicateSuppliers.length > 0 && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <h3 className="font-semibold">Proveedores Duplicados Detectados</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Selecciona el nombre correcto para cada grupo de proveedores duplicados
            </p>
            
            {duplicateSuppliers.map((duplicate, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {duplicate.suppliers.length} variantes encontradas
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {duplicate.item_count} elementos afectados
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Selecciona el nombre a mantener:</Label>
                  {duplicate.suppliers.map((supplier) => (
                    <div key={supplier} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`supplier-${index}-${supplier}`}
                        name={`supplier-group-${index}`}
                        value={supplier}
                        checked={selectedSuppliers[index] === supplier}
                        onChange={(e) => 
                          setSelectedSuppliers(prev => ({
                            ...prev,
                            [index]: e.target.value
                          }))
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                      <Label 
                        htmlFor={`supplier-${index}-${supplier}`}
                        className="cursor-pointer font-normal text-sm"
                      >
                        {supplier}
                      </Label>
                    </div>
                  ))}
                </div>
                
                <p className="text-xs text-muted-foreground italic">
                  {duplicate.reason}
                </p>
              </div>
            ))}
            
            <Button 
              onClick={handleUnifySuppliers}
              disabled={applying}
              className="w-full"
            >
              {applying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unificando proveedores...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Unificar Proveedores Seleccionados
                </>
              )}
            </Button>
          </div>
        )}

        {showResults && results.length > 0 && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Resultados del anÃ¡lisis: {deleteCount} items a eliminar, {updateCount} items a actualizar, {keepCount} items correctos.
              </AlertDescription>
            </Alert>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {results.map((result) => (
                <Card key={result.item_id} className="p-3">
                  <div className="flex items-start gap-3">
                    {getActionIcon(result.action)}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{result.original_name}</span>
                        {getActionBadge(result.action)}
                      </div>
                      <p className="text-sm text-muted-foreground">{result.reason}</p>
                      {result.suggested_changes && (
                        <div className="text-xs bg-muted p-2 rounded mt-2">
                          <strong>Cambios sugeridos:</strong>
                          <ul className="mt-1 space-y-1">
                            {result.suggested_changes.item_type && (
                              <li>â€¢ Tipo: {result.suggested_changes.item_type}</li>
                            )}
                            {result.suggested_changes.category && (
                              <li>â€¢ CategorÃ­a: {result.suggested_changes.category}</li>
                            )}
                            {result.suggested_changes.unit && (
                              <li>â€¢ Unidad: {result.suggested_changes.unit}</li>
                            )}
                            {result.suggested_changes.name && (
                              <li>â€¢ Nombre: {result.suggested_changes.name}</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleApplyChanges} 
                disabled={applying}
                className="flex-1"
              >
                {applying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aplicando cambios...
                  </>
                ) : (
                  'Aplicar Todos los Cambios'
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowResults(false)}
                disabled={applying}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {showResults && results.length === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              No se encontraron items que requieran correcciones. El inventario estÃ¡ correcto.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

