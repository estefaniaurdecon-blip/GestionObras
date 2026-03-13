import { Button } from '@/components/ui/button';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AccessReport } from '@/types/accessControl';
import { toIsoDate, type HistoryFilterKey } from '@/pages/indexHelpers';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, FileText, Search } from 'lucide-react';

type AccessReportSearchFilterKey = Exclude<HistoryFilterKey, 'workName'>;
type AccessReportPeriodDialogMode = 'daily' | 'weekly' | 'monthly' | 'custom';

type SearchFilterOption = { key: AccessReportSearchFilterKey; label: string };

type AccessControlGenerateReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchOpen: boolean;
  reportSiteOptions: string[];
  accessReportSelectedWorks: string[];
  accessReportSelectedWorksLabel: string;
  accessReportWorkSelectValue: string;
  accessReportPeriodFilter: string;
  accessReportPeriodOptionLabel: string;
  accessReportPeriodSelectValue: string;
  accessReportPeriodSelectionLabel: string;
  accessReportSelectedDateKeys: string[];
  accessReportEnabledFilters: AccessReportSearchFilterKey[];
  accessReportSelectedFiltersCount: number;
  accessReportAppliedFiltersCount: number;
  accessResponsibleFilter: string;
  accessWeekFilter: string;
  accessMonthFilter: string;
  accessDateFilter: string;
  accessDatePickerOpen: boolean;
  selectedAccessReportDate: Date | null;
  filteredAccessControlReportsForGenerate: AccessReport[];
  searchFilterOptions: SearchFilterOption[];
  draftAccessReportSelectedWorks: string[];
  lightButtonClass: string;
  onWorkFilterChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  onToggleSearchFilter: (filterKey: AccessReportSearchFilterKey) => void;
  onResponsibleFilterChange: (value: string) => void;
  onWeekFilterChange: (value: string) => void;
  onMonthFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onDatePickerOpenChange: (value: boolean) => void;
  onClearSearchFilters: () => void;
  onToggleDraftSelectedWork: (siteName: string) => void;
  onClearDraftSelectedWorks: () => void;
  onApplySelectedWorks: () => void;
  onGenerateReport: () => void;
};

export const AccessControlGenerateReportDialog = ({
  open,
  onOpenChange,
  searchOpen,
  reportSiteOptions,
  accessReportSelectedWorks,
  accessReportSelectedWorksLabel,
  accessReportWorkSelectValue,
  accessReportPeriodFilter,
  accessReportPeriodOptionLabel,
  accessReportPeriodSelectValue,
  accessReportPeriodSelectionLabel,
  accessReportSelectedDateKeys,
  accessReportEnabledFilters,
  accessReportSelectedFiltersCount,
  accessReportAppliedFiltersCount,
  accessResponsibleFilter,
  accessWeekFilter,
  accessMonthFilter,
  accessDateFilter,
  accessDatePickerOpen,
  selectedAccessReportDate,
  filteredAccessControlReportsForGenerate,
  searchFilterOptions,
  draftAccessReportSelectedWorks,
  lightButtonClass,
  onWorkFilterChange,
  onPeriodChange,
  onToggleSearchFilter,
  onResponsibleFilterChange,
  onWeekFilterChange,
  onMonthFilterChange,
  onDateFilterChange,
  onDatePickerOpenChange,
  onClearSearchFilters,
  onToggleDraftSelectedWork,
  onClearDraftSelectedWorks,
  onApplySelectedWorks,
  onGenerateReport,
}: AccessControlGenerateReportDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl">
      <DialogHeader className="text-center">
        <DialogTitle>Generar informe</DialogTitle>
        <DialogDescription>Sistema de Gestion de Obras</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {searchOpen ? (
          <div className="space-y-4">
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <div className="flex items-start gap-2">
                <Search className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Activa filtros para localizar obras por encargado, semana, mes o fecha.</span>
              </div>
            </div>

            <div className="rounded-md border bg-slate-100 p-2">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
                {searchFilterOptions.map((filterOption) => {
                  const isEnabled = accessReportEnabledFilters.includes(filterOption.key);
                  return (
                    <Button
                      key={filterOption.key}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={`h-9 w-full rounded-md px-2 text-sm sm:w-auto sm:px-3 sm:text-[15px] ${
                        isEnabled
                          ? 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                      onClick={() => onToggleSearchFilter(filterOption.key)}
                    >
                      {filterOption.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {accessReportSelectedFiltersCount > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {accessReportEnabledFilters.includes('foreman') ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="access-report-foreman">
                      Encargado
                    </label>
                    <Input
                      id="access-report-foreman"
                      value={accessResponsibleFilter}
                      onChange={(event) => onResponsibleFilterChange(event.target.value)}
                      placeholder="Ej. Juan Perez"
                    />
                  </div>
                ) : null}

                {accessReportEnabledFilters.includes('weeks') ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="access-report-week">
                      Semana
                    </label>
                    <Input
                      id="access-report-week"
                      type="week"
                      value={accessWeekFilter}
                      onChange={(event) => onWeekFilterChange(event.target.value)}
                    />
                  </div>
                ) : null}

                {accessReportEnabledFilters.includes('months') ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="access-report-month">
                      Mes
                    </label>
                    <Input
                      id="access-report-month"
                      type="month"
                      value={accessMonthFilter}
                      onChange={(event) => onMonthFilterChange(event.target.value)}
                    />
                  </div>
                ) : null}

                {accessReportEnabledFilters.includes('date') ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="access-report-date">
                      Fecha
                    </label>
                    <Popover open={accessDatePickerOpen} onOpenChange={onDatePickerOpenChange}>
                      <PopoverTrigger asChild>
                        <Button
                          id="access-report-date"
                          type="button"
                          variant="outline"
                          className={`w-full justify-between text-left font-normal ${
                            selectedAccessReportDate ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {selectedAccessReportDate
                            ? format(selectedAccessReportDate, 'dd/MM/yyyy', { locale: es })
                            : 'Seleccionar fecha'}
                          <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <DateCalendar
                          mode="single"
                          selected={selectedAccessReportDate ?? undefined}
                          onSelect={(selectedDate) => {
                            if (!selectedDate) {
                              onDateFilterChange('');
                              return;
                            }
                            onDateFilterChange(toIsoDate(selectedDate));
                            onDatePickerOpenChange(false);
                          }}
                          locale={es}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                Obras encontradas: <span className="font-medium">{reportSiteOptions.length}</span>. Controles
                coincidentes: <span className="font-medium">{filteredAccessControlReportsForGenerate.length}</span>.
                Filtros seleccionados: <span className="font-medium">{accessReportSelectedFiltersCount}</span>/
                {searchFilterOptions.length}. Aplicados: <span className="font-medium">{accessReportAppliedFiltersCount}</span>.
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onClearSearchFilters}>
                Limpiar filtros
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Resultados de obras</label>
              {reportSiteOptions.length === 0 ? (
                <div className="rounded-md border bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                  No hay obras que coincidan con la busqueda.
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-slate-50 p-2">
                  {reportSiteOptions.map((siteName) => (
                    <button
                      key={siteName}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                        draftAccessReportSelectedWorks.includes(siteName)
                          ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                      onClick={() => onToggleDraftSelectedWork(siteName)}
                    >
                      <Checkbox
                        checked={draftAccessReportSelectedWorks.includes(siteName)}
                        className="pointer-events-none data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                      />
                      <span className="font-medium">{siteName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClearDraftSelectedWorks}>
                Todas las obras
              </Button>
              <Button type="button" variant="outline" className={lightButtonClass} onClick={onApplySelectedWorks}>
                Aplicar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nombre de Obra</label>
              <Select value={accessReportWorkSelectValue} onValueChange={onWorkFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las obras</SelectItem>
                  {accessReportSelectedWorks.length > 0 ? (
                    <SelectItem value="__selected__">{accessReportSelectedWorksLabel}</SelectItem>
                  ) : null}
                  <SelectItem value="__search__">Buscar obra...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Periodo</label>
              <Select value={accessReportPeriodSelectValue} onValueChange={onPeriodChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todo el periodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el periodo</SelectItem>
                  {accessReportPeriodFilter !== 'all' ? (
                    <SelectItem value="__selected_period__">{accessReportPeriodOptionLabel}</SelectItem>
                  ) : null}
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
              {accessReportPeriodFilter !== 'all' && accessReportPeriodSelectionLabel ? (
                <p className="text-sm text-muted-foreground">
                  {accessReportPeriodSelectionLabel}. Fechas incluidas: {accessReportSelectedDateKeys.length}
                </p>
              ) : null}
            </div>

            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                className={`w-full sm:w-auto sm:min-w-[180px] ${lightButtonClass}`}
                onClick={onGenerateReport}
              >
                <FileText className="mr-2 h-4 w-4" />
                Generar informe
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogContent>
  </Dialog>
);
