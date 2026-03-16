import { useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EconomicsOverviewPanel } from '@/components/api/EconomicsOverviewPanel';
import { CompanyPortfolio } from '@/components/CompanyPortfolio';
import { EconomicManagement } from '@/components/EconomicManagement';
import { SavedEconomicReports } from '@/components/SavedEconomicReports';
import { WorkManagement } from '@/components/WorkManagement';
import type { WorkReport as OfflineWorkReport } from '@/offline-db/types';
import { payloadBoolean, payloadText } from '@/pages/indexHelpers';
import { buildExportWorkReport } from '@/services/workReportExportDomain';
import type { WorkReport as LegacyWorkReport } from '@/types/workReport';
import { startupPerfPoint } from '@/utils/startupPerf';
import { HelpCircle } from 'lucide-react';

type IndexSecondaryTabsProps = {
  sortedWorks: Array<{ id: string | number; number?: string | null; name?: string | null }>;
  worksLoading: boolean;
  economicSourceReports: OfflineWorkReport[];
  economicReportsLoaded: boolean;
  economicReportsLoading: boolean;
  showUpdatesTab?: boolean;
  onOpenProjects: () => void;
  onReloadWorks: () => void;
};

export const IndexSecondaryTabs = ({
  sortedWorks: _sortedWorks,
  worksLoading: _worksLoading,
  economicSourceReports,
  economicReportsLoaded,
  economicReportsLoading,
  showUpdatesTab: _showUpdatesTab,
  onOpenProjects: _onOpenProjects,
  onReloadWorks: _onReloadWorks,
}: IndexSecondaryTabsProps) => {
  useEffect(() => {
    startupPerfPoint('panel:IndexSecondaryTabs mounted');
  }, []);

  const economicManagementReports = useMemo<LegacyWorkReport[]>(() => {
    return economicSourceReports.map((report) => {
      const exportReport = buildExportWorkReport(report);
      const normalizedStatus: LegacyWorkReport['status'] =
        report.status === 'completed' || report.status === 'approved' || report.status === 'closed'
          ? 'completed'
          : report.status === 'missing_delivery_notes'
            ? 'missing_delivery_notes'
            : 'missing_data';
      const workNumber =
        exportReport.workNumber ||
        payloadText(report.payload, 'reportIdentifier') ||
        report.id.slice(0, 8);
      const workName = exportReport.workName || report.title || `Parte ${report.date}`;
      const approved = payloadBoolean(report.payload, 'approved') ?? report.status === 'approved';

      return {
        ...exportReport,
        workNumber,
        workName,
        status: normalizedStatus,
        approved,
      };
    });
  }, [economicSourceReports]);

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
              Cartera de empresas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="m-0">
            <WorkManagement />
          </TabsContent>

          <TabsContent value="portfolio" className="m-0">
            <CompanyPortfolio />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="economics" className="m-0 space-y-4">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-slate-900 sm:text-3xl">Analisis economico</CardTitle>
            <CardDescription>
              Resumen ERP + gestion economica complementaria de partes, todo sobre API propia.
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 text-slate-600">
            <TabsTrigger
              value="overview"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Resumen ERP
            </TabsTrigger>
            <TabsTrigger
              value="management"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Gestion de precios
            </TabsTrigger>
            <TabsTrigger
              value="saved"
              className="rounded px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Reportes guardados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="m-0">
            <EconomicsOverviewPanel />
          </TabsContent>

          <TabsContent value="management" className="m-0">
            {!economicReportsLoaded && economicReportsLoading && economicManagementReports.length > 0 ? (
              <Card className="bg-sky-50 border-sky-200">
                <CardContent className="py-4 text-sm text-sky-800">
                  Mostrando partes disponibles mientras se completa la carga del historico en segundo plano.
                </CardContent>
              </Card>
            ) : null}

            {!economicReportsLoaded && economicReportsLoading && economicManagementReports.length === 0 ? (
              <Card className="bg-white">
                <CardContent className="py-6 text-sm text-slate-600">
                  Cargando partes para gestion economica...
                </CardContent>
              </Card>
            ) : (
              <EconomicManagement reports={economicManagementReports} onReportUpdate={() => undefined} />
            )}
          </TabsContent>

          <TabsContent value="saved" className="m-0">
            <SavedEconomicReports />
          </TabsContent>
        </Tabs>
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
