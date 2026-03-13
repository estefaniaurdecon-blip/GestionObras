import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Package, ShoppingBag, Truck } from 'lucide-react';
import { useWorks } from '@/hooks/useWorks';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkInventory } from '@/components/WorkInventory';
import { WorkPostventasSection } from '@/components/WorkPostventasSection';
import { WorkRentalMachineryManagement } from '@/components/WorkRentalMachineryManagement';
import { WorkRepasosSection } from '@/components/WorkRepasosSection';

type WorkManagementTab = 'inventory' | 'rental' | 'repasos' | 'postventa';

const parseTab = (value: string | null): WorkManagementTab => {
  if (value === 'rental' || value === 'repasos' || value === 'postventa') {
    return value;
  }
  return 'inventory';
};

const WorkManagementWorkspace = () => {
  const navigate = useNavigate();
  const { workId } = useParams<{ workId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { works, loading } = useWorks();
  const { isAdmin, isSiteManager } = useUserPermissions();

  const canManageWorks = isAdmin || isSiteManager;
  const activeTab = parseTab(searchParams.get('tab'));

  const work = useMemo(() => {
    if (!workId) return undefined;
    return works.find((item) => String(item.id) === String(workId));
  }, [works, workId]);

  const setTab = (tab: WorkManagementTab) => {
    if (!canManageWorks && tab !== 'inventory') return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Cargando gestion de obra...</CardContent>
        </Card>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="space-y-4 py-10 text-center">
            <p className="text-muted-foreground">No se encontro la obra solicitada.</p>
            <Button variant="outline" onClick={() => navigate('/')}>
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const workLabel = `${work.number || ''}${work.number && work.name ? ' - ' : ''}${work.name || 'Sin nombre'}`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-0 top-1/2 -translate-y-1/2"
              onClick={() => navigate(-1)}
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <CardTitle className="text-2xl">Gestion de Obra</CardTitle>
              <p className="text-sm text-muted-foreground">{workLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Button variant={activeTab === 'inventory' ? 'default' : 'outline'} onClick={() => setTab('inventory')}>
              <Package className="mr-2 h-4 w-4" />
              Inventario
            </Button>
            <Button
              variant={activeTab === 'rental' ? 'default' : 'outline'}
              onClick={() => setTab('rental')}
              disabled={!canManageWorks}
            >
              <Truck className="mr-2 h-4 w-4" />
              Maq. Alquiler
            </Button>
            <Button
              variant={activeTab === 'repasos' ? 'default' : 'outline'}
              onClick={() => setTab('repasos')}
              disabled={!canManageWorks}
            >
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Repasos
            </Button>
            <Button
              variant={activeTab === 'postventa' ? 'default' : 'outline'}
              onClick={() => setTab('postventa')}
              disabled={!canManageWorks}
            >
              <ShoppingBag className="mr-2 h-4 w-4" />
              Post-Venta
            </Button>
          </div>
        </CardHeader>
      </Card>

      {activeTab === 'inventory' ? <WorkInventory workId={String(work.id)} workName={workLabel} /> : null}
      {activeTab === 'rental' ? <WorkRentalMachineryManagement workId={String(work.id)} /> : null}
      {activeTab === 'repasos' ? (
        <WorkRepasosSection workId={String(work.id)} workName={work.name || ''} workNumber={work.number || ''} />
      ) : null}
      {activeTab === 'postventa' ? (
        <WorkPostventasSection workId={String(work.id)} workName={work.name || ''} workNumber={work.number || ''} />
      ) : null}
    </div>
  );
};

export default WorkManagementWorkspace;
