import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DashboardToolsTab = 'parts' | 'bulk-export' | 'data-management' | 'summary-report' | 'history';

type DashboardToolsTabsProps = {
  value: DashboardToolsTab;
  onValueChange: (value: DashboardToolsTab) => void;
};

const TOOLS_TABS: Array<{ value: DashboardToolsTab; label: string }> = [
  { value: 'parts', label: 'Partes' },
  { value: 'bulk-export', label: 'Exportacion masiva' },
  { value: 'data-management', label: 'Gestion de datos' },
  { value: 'summary-report', label: 'Informe resumen' },
  { value: 'history', label: 'Historial de partes' },
];

export const DashboardToolsTabs = ({ value, onValueChange }: DashboardToolsTabsProps) => {
  return (
    <div className="w-full rounded-md border border-slate-200 bg-transparent">
      <div className="overflow-x-auto">
        <div className="flex w-max min-w-full items-center justify-center gap-2 p-1">
          {TOOLS_TABS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              variant="ghost"
              onClick={() => onValueChange(tab.value)}
              className={cn(
                'h-9 whitespace-nowrap rounded-md bg-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-300 hover:text-slate-900',
                value === tab.value
                  ? 'bg-slate-300 text-slate-900 shadow-none'
                  : ''
              )}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
