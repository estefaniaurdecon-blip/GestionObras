import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { EconomicsOverviewPanel } from '@/components/api/EconomicsOverviewPanel';
import { UsersAdminPanel } from '@/components/api/UsersAdminPanel';
import { HelpCircle, RefreshCw, Users } from 'lucide-react';

type WorkItem = {
  id: string | number;
  number?: string | null;
  name?: string | null;
};

type IndexSecondaryTabsProps = {
  sortedWorks: WorkItem[];
  worksLoading: boolean;
  showUserManagementTab: boolean;
  // Optional for backwards compatibility with old Index prop wiring.
  showUpdatesTab?: boolean;
  userTenantId?: number;
  isSuperAdmin: boolean;
  onOpenProjects: () => void;
  onReloadWorks: () => void;
};

export const IndexSecondaryTabs = ({
  sortedWorks,
  worksLoading,
  showUserManagementTab,
  showUpdatesTab: _showUpdatesTab,
  userTenantId,
  isSuperAdmin,
  onOpenProjects,
  onReloadWorks,
}: IndexSecondaryTabsProps) => {
  return (
    <>
      <TabsContent value="works" className="m-0 space-y-4">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Obras</CardTitle>
            <CardDescription>Datos cargados desde la API (`/api/v1/erp/projects`).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={onOpenProjects}>Abrir gestion completa</Button>
              <Button variant="outline" onClick={onReloadWorks} disabled={worksLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${worksLoading ? 'animate-spin' : ''}`} />
                Recargar
              </Button>
            </div>

            {sortedWorks.length === 0 ? (
              <div className="text-sm text-muted-foreground">No hay obras visibles.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedWorks.slice(0, 12).map((work) => (
                  <div key={work.id} className="rounded-md border bg-white p-3">
                    <div className="font-medium text-sm">{work.name || 'Sin nombre'}</div>
                    <div className="text-xs text-muted-foreground">Codigo: {work.number || '-'}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="economics" className="m-0 space-y-4">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Analisis Economico</CardTitle>
            <CardDescription>
              Datos enlazados con `/api/v1/summary/*` y `/api/v1/erp/projects/*/budgets`.
            </CardDescription>
          </CardHeader>
        </Card>
        <EconomicsOverviewPanel />
      </TabsContent>

      {showUserManagementTab ? (
        <TabsContent value="users" className="m-0 space-y-4">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-700" />
                Gestion de usuarios
              </CardTitle>
              <CardDescription>
                Visible solo para superadmin. El registro web esta deshabilitado.
              </CardDescription>
            </CardHeader>
          </Card>
          <UsersAdminPanel tenantId={userTenantId} isSuperAdmin={isSuperAdmin} />
        </TabsContent>
      ) : null}

      <TabsContent value="help" className="m-0 space-y-4">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-700" />
              Ayuda
            </CardTitle>
            <CardDescription>Soporte y documentacion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Si tienes incidencias con el acceso, contacta con el administrador.</div>
            <div className="text-xs">
              Nota: el centro de ayuda completo se reactivara cuando este migrado sin Supabase.
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </>
  );
};
