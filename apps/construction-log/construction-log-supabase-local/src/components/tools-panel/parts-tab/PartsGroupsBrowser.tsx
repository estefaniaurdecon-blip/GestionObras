import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkReport } from '@/offline-db/types';
import { PartsReportCard } from './PartsReportCard';
import type { PartsExcelPeriod, PartsGroupedReports, PartsGroupMode } from './shared';
import { PARTS_GROUPS_PAGE_SIZE, PARTS_REPORTS_PAGE_SIZE } from './shared';

type PartsGroupsBrowserProps = {
  showPartsFilters: boolean;
  partsGroupMode: PartsGroupMode;
  activePartsGroups: PartsGroupedReports[];
  visiblePartsGroups: PartsGroupedReports[];
  selectedPartsGroupKey: string;
  openPartsGroupKey: string;
  visibleReportsByGroup: Record<string, number>;
  hiddenPartsGroupsCount: number;
  recentReports: WorkReport[];
  recentNavigationIds: string[];
  excelExportingPeriod: PartsExcelPeriod | null;
  canExportWeekly: boolean;
  canExportMonthly: boolean;
  reportNameClass: string;
  reportDetailClass: string;
  tenantUnavailable: boolean;
  workReportsReadOnlyByRole: boolean;
  onPartsGroupModeChange: (mode: PartsGroupMode) => void;
  onExport: (period: PartsExcelPeriod) => void;
  onTogglePartsGroupSelection: (groupKey: string) => void;
  onOpenPartsGroupChange: (groupKey: string) => void;
  onShowMoreReports: (groupKey: string, totalReports: number) => void;
  onShowMoreGroups: () => void;
  onCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenExistingReport: (report: WorkReport, options?: { navigationReportIds?: string[] }) => void;
  onDeleteReport: (report: WorkReport) => void;
};

export const PartsGroupsBrowser = ({
  showPartsFilters,
  partsGroupMode,
  activePartsGroups,
  visiblePartsGroups,
  selectedPartsGroupKey,
  openPartsGroupKey,
  visibleReportsByGroup,
  hiddenPartsGroupsCount,
  recentReports,
  recentNavigationIds,
  excelExportingPeriod,
  canExportWeekly,
  canExportMonthly,
  reportNameClass,
  reportDetailClass,
  tenantUnavailable,
  workReportsReadOnlyByRole,
  onPartsGroupModeChange,
  onExport,
  onTogglePartsGroupSelection,
  onOpenPartsGroupChange,
  onShowMoreReports,
  onShowMoreGroups,
  onCloneFromHistoryDialog,
  onOpenExistingReport,
  onDeleteReport,
}: PartsGroupsBrowserProps) => (
  <>
    <div
      className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        showPartsFilters
          ? 'grid-rows-[1fr] translate-y-0 opacity-100'
          : 'pointer-events-none grid-rows-[0fr] -translate-y-1 opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="space-y-3 pt-1">
          <div className="rounded-md border bg-slate-100 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                value={partsGroupMode}
                onValueChange={(value) => onPartsGroupModeChange(value as PartsGroupMode)}
                className="w-full sm:w-auto"
              >
                <TabsList className="grid h-9 w-full grid-cols-3 rounded-md border border-slate-300 bg-slate-100 sm:w-auto">
                  <TabsTrigger
                    value="foreman"
                    className="text-[14px] data-[state=active]:border data-[state=active]:border-slate-400 data-[state=active]:bg-slate-300 data-[state=active]:text-slate-900 sm:text-[15px]"
                  >
                    Por Encargado
                  </TabsTrigger>
                  <TabsTrigger
                    value="weekly"
                    className="text-[14px] data-[state=active]:border data-[state=active]:border-slate-400 data-[state=active]:bg-slate-300 data-[state=active]:text-slate-900 sm:text-[15px]"
                  >
                    Por Semanas
                  </TabsTrigger>
                  <TabsTrigger
                    value="monthly"
                    className="text-[14px] data-[state=active]:border data-[state=active]:border-slate-400 data-[state=active]:bg-slate-300 data-[state=active]:text-slate-900 sm:text-[15px]"
                  >
                    Por Meses
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-[14px] sm:text-[15px]"
                onClick={() => onExport('weekly')}
                disabled={excelExportingPeriod !== null || !canExportWeekly}
              >
                {excelExportingPeriod === 'weekly' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Excel Semanal
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-[14px] sm:text-[15px]"
                onClick={() => onExport('monthly')}
                disabled={excelExportingPeriod !== null || !canExportMonthly}
              >
                {excelExportingPeriod === 'monthly' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Excel Mensual
                  </>
                )}
              </Button>
            </div>
          </div>

          {activePartsGroups.length === 0 ? (
            <div className="rounded-md border bg-slate-50 px-3 py-4 text-[15px] text-slate-500">
              No hay partes disponibles para la agrupacion seleccionada.
            </div>
          ) : (
            <div className="space-y-3">
              <Accordion
                type="single"
                collapsible
                value={openPartsGroupKey}
                onValueChange={onOpenPartsGroupChange}
                className="rounded-md border bg-slate-50"
              >
                {visiblePartsGroups.map((group) => {
                  const navigationIds = group.reports.map((report) => report.id);
                  const isSelectedGroup = selectedPartsGroupKey === group.key;
                  const isOpenGroup = openPartsGroupKey === group.key;
                  const visibleReportsForGroup = group.reports.slice(
                    0,
                    visibleReportsByGroup[group.key] ?? PARTS_REPORTS_PAGE_SIZE,
                  );
                  const hiddenReportsForGroup = Math.max(group.reports.length - visibleReportsForGroup.length, 0);

                  return (
                    <AccordionItem key={group.key} value={group.key} className="last:border-b-0">
                      <div
                        className={`flex items-center gap-2 border-b px-3 py-2 ${
                          isSelectedGroup ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2 text-left"
                          onClick={() => onTogglePartsGroupSelection(group.key)}
                        >
                          <span className="truncate text-[16px] font-medium text-slate-900 sm:text-[17px]">
                            {group.label}
                          </span>
                          <Badge variant="outline" className="shrink-0 border-slate-300 bg-white text-slate-700">
                            {group.reports.length}
                          </Badge>
                        </button>
                        <AccordionPrimitive.Header className="flex shrink-0">
                          <AccordionPrimitive.Trigger className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100">
                            <ChevronDown className={`h-4 w-4 transition-transform ${isOpenGroup ? 'rotate-180' : ''}`} />
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>
                      </div>
                      <AccordionContent className="border-t bg-white pb-0 pt-0">
                        <div className="divide-y">
                          {visibleReportsForGroup.map((report) => (
                            <PartsReportCard
                              key={`${group.key}-${report.id}`}
                              report={report}
                              navigationIds={navigationIds}
                              keyPrefix={group.key}
                              reportNameClass={reportNameClass}
                              reportDetailClass={reportDetailClass}
                              tenantUnavailable={tenantUnavailable}
                              workReportsReadOnlyByRole={workReportsReadOnlyByRole}
                              onCloneFromHistoryDialog={onCloneFromHistoryDialog}
                              onOpenExistingReport={onOpenExistingReport}
                              onDeleteReport={onDeleteReport}
                            />
                          ))}
                        </div>
                        {hiddenReportsForGroup > 0 ? (
                          <div className="border-t px-3 py-3 text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onShowMoreReports(group.key, group.reports.length)}
                            >
                              Mostrar {Math.min(PARTS_REPORTS_PAGE_SIZE, hiddenReportsForGroup)} mas
                            </Button>
                          </div>
                        ) : null}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
              {hiddenPartsGroupsCount > 0 ? (
                <div className="flex items-center justify-center">
                  <Button type="button" variant="outline" onClick={onShowMoreGroups}>
                    Mostrar {Math.min(PARTS_GROUPS_PAGE_SIZE, hiddenPartsGroupsCount)} grupos mas
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>

    {!showPartsFilters ? (
      <div className="rounded-md border bg-slate-50">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
          <p className="text-[14px] font-medium text-slate-700 sm:text-[15px]">
            {`Mostrando ${recentReports.length} parte(s) recientes (ultimos 7 dias)`}
          </p>
        </div>
        {recentReports.length === 0 ? (
          <div className="px-3 py-4 text-[15px] text-slate-500">No hay partes para la seleccion actual.</div>
        ) : (
          <div className="divide-y">
            {recentReports.map((report) => (
              <PartsReportCard
                key={`display-${report.id}`}
                report={report}
                navigationIds={recentNavigationIds}
                keyPrefix="display"
                reportNameClass={reportNameClass}
                reportDetailClass={reportDetailClass}
                tenantUnavailable={tenantUnavailable}
                workReportsReadOnlyByRole={workReportsReadOnlyByRole}
                onCloneFromHistoryDialog={onCloneFromHistoryDialog}
                onOpenExistingReport={onOpenExistingReport}
                onDeleteReport={onDeleteReport}
              />
            ))}
          </div>
        )}
      </div>
    ) : null}
  </>
);
