import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DashboardToolsTab = 'parts' | 'bulk-export' | 'data-management' | 'summary-report' | 'history';

type DashboardToolsTabsProps = {
  value: DashboardToolsTab;
  onValueChange: (value: DashboardToolsTab) => void;
};

const BASE_TOOLS_TABS: Array<{ value: DashboardToolsTab; label: string }> = [
  { value: 'bulk-export', label: 'Exportacion masiva' },
  { value: 'data-management', label: 'Gestion de datos' },
  { value: 'summary-report', label: 'Informe resumen' },
  { value: 'history', label: 'Historial de partes' },
];

export const DashboardToolsTabs = ({
  value,
  onValueChange,
}: DashboardToolsTabsProps) => {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-transparent">
      <div className="overflow-x-auto">
        <div className="grid w-full grid-cols-2 gap-2 p-1 sm:grid-cols-4">
          {BASE_TOOLS_TABS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              variant="ghost"
              onClick={() => onValueChange(tab.value)}
              className={cn(
                'min-h-10 h-auto w-full justify-center whitespace-normal rounded-lg bg-slate-200 px-2 py-1.5 sm:px-3 text-center text-[13px] sm:text-[15px] md:text-base font-medium leading-tight text-slate-700 hover:bg-slate-300 hover:text-slate-900',
                value === tab.value
                  ? 'bg-slate-300 text-slate-900 shadow-none'
                  : ''
              )}
            >
              <span className="inline-flex items-center gap-1.5">{tab.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
