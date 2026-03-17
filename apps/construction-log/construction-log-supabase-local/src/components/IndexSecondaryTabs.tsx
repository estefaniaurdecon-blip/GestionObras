import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  initialWorkId?: string;
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
  initialWorkId,
}: IndexSecondaryTabsProps) => {
  const [savedReportsRefreshKey, setSavedReportsRefreshKey] = useState(0);

  useEffect(() => {
    startupPerfPoint('panel:IndexSecondaryTabs mounted');
  }, []);

  const economicManagementReports = useMemo<LegacyWorkReport[]>(() => {
    return economicSourceReports.map((report) => {
      const exportReport = buildExportWorkReport(report);
      const normalizedStatus: LegacyWorkReport['status'] =
        report.status === 'completed' || report.status === 'approved'
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
          <TabsList className="h-auto w-full justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600">
            <TabsTrigger
              value="projects"
              className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Obras
            </TabsTrigger>
            <TabsTrigger
              value="portfolio"
              className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Cartera de empresas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="m-0">
            <WorkManagement initialWorkId={initialWorkId} />
          </TabsContent>

          <TabsContent value="portfolio" className="m-0">
            <CompanyPortfolio />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="economics" className="m-0">
        <Card className="bg-white">
          <CardHeader className="text-center">
            <CardTitle className="app-page-title">Análisis económico</CardTitle>
            <CardDescription className="app-page-subtitle">
              Gestion economica complementaria de partes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-4 pb-6">
            {!economicReportsLoaded && economicReportsLoading && economicManagementReports.length > 0 ? (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Mostrando partes disponibles mientras se completa la carga del historico en segundo plano.
              </div>
            ) : null}

            {!economicReportsLoaded && economicReportsLoading && economicManagementReports.length === 0 ? (
              <div className="py-4 text-sm text-slate-600">
                Cargando partes para gestion economica...
              </div>
            ) : (
              <EconomicManagement
                reports={economicManagementReports}
                onReportUpdate={() => undefined}
                onSaveSuccess={() => setSavedReportsRefreshKey((k) => k + 1)}
              />
            )}

            <SavedEconomicReports refreshKey={savedReportsRefreshKey} />
          </CardContent>
        </Card>
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
