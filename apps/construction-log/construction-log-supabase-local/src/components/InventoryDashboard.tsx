import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Wrench, Truck, Warehouse, TrendingUp, FileCheck, AlertTriangle } from 'lucide-react';
import { useInventoryMovements } from '@/hooks/useInventoryMovements';

interface InventoryDashboardProps {
  workId?: string;
  workName?: string;
}

export const InventoryDashboard = ({ workId, workName }: InventoryDashboardProps) => {
  const { t } = useTranslation();
  const { kpis, isLoading } = useInventoryMovements(workId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Main KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Stock Value */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Valor de Stock en Almacén
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-green-600">
              {formatCurrency(kpis?.totalStockValue || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Materiales disponibles para uso
            </p>
          </CardContent>
        </Card>

        {/* Direct Consumption */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Consumo Directo en Obra
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-orange-600">
              {formatCurrency(kpis?.directConsumptionValue || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Hormigón, áridos y materiales a granel
            </p>
          </CardContent>
        </Card>

        {/* Pending Notes */}
        <Card className={`border-l-4 ${(kpis?.pendingDeliveryNotes || 0) > 0 ? 'border-l-yellow-500' : 'border-l-gray-300'}`}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Albaranes Pendientes
            </CardDescription>
            <CardTitle className={`text-2xl font-bold ${(kpis?.pendingDeliveryNotes || 0) > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>
              {kpis?.pendingDeliveryNotes || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(kpis?.pendingDeliveryNotes || 0) > 0 ? (
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Requieren validación
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Todo al día
              </p>
            )}
          </CardContent>
        </Card>

        {/* Item Categories Summary */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Items en Inventario
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600">
              {(kpis?.totalMaterialItems || 0) + (kpis?.totalToolItems || 0) + (kpis?.totalMachineryItems || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                <Package className="h-3 w-3 mr-1" />
                {kpis?.totalMaterialItems || 0} Materiales
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Wrench className="h-3 w-3 mr-1" />
                {kpis?.totalToolItems || 0} Herramientas
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Truck className="h-3 w-3 mr-1" />
                {kpis?.totalMachineryItems || 0} Maquinaria
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Direct Consumption */}
      {kpis?.recentMovements && kpis.recentMovements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              Últimos Consumos Directos
            </CardTitle>
            <CardDescription>
              Materiales de ejecución inmediata registrados recientemente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {kpis.recentMovements.slice(0, 5).map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                      {movement.movement_type === 'entry' ? 'Entrada' : 'Salida'}
                    </Badge>
                    <div>
                      <p className="font-medium">{movement.item_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {movement.supplier} · {movement.quantity} {movement.unit}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      {formatCurrency(movement.total_price || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(movement.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
