import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EconomicsOverviewPanel } from '@/components/api/EconomicsOverviewPanel';
import { CompanyPortfolio } from '@/components/CompanyPortfolio';
import { ProjectsPanel } from '@/components/ProjectsPanel';
import { startupPerfPoint } from '@/utils/startupPerf';
import { HelpCircle } from 'lucide-react';

type IndexSecondaryTabsProps = {
  sortedWorks: Array<{ id: string | number; number?: string | null; name?: string | null }>;
  worksLoading: boolean;
  showUpdatesTab?: boolean;
  onOpenProjects: () => void;
  onReloadWorks: () => void;
};

export const IndexSecondaryTabs = ({
  sortedWorks: _sortedWorks,
  worksLoading: _worksLoading,
  showUpdatesTab: _showUpdatesTab,
  onOpenProjects: _onOpenProjects,
  onReloadWorks: _onReloadWorks,
}: IndexSecondaryTabsProps) => {
  useEffect(() => {
    startupPerfPoint('panel:IndexSecondaryTabs mounted');
  }, []);

  return (
    <>
      <TabsContent value="works" className="m-0 space-y-4">
        <Tabs defaultValue="projects" className="space-y-4">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 text-slate-600">
            <TabsTrigger
              value="projects"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Obras
            </TabsTrigger>
            <TabsTrigger
              value="portfolio"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Cartera de Empresas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="m-0">
            <ProjectsPanel
              title="Obras"
              description="Datos cargados desde la API (`/api/v1/erp/projects`)."
              createButtonLabel="Añadir Obras"
              emptyMessage="No hay obras registradas."
            />
          </TabsContent>

          <TabsContent value="portfolio" className="m-0">
            <CompanyPortfolio />
          </TabsContent>
        </Tabs>
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
