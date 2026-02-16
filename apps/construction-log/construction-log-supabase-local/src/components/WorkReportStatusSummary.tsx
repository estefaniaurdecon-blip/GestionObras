import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WorkReport, WorkReportSection } from '@/types/workReport';
import { CheckCircle, Clock, Shield, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'completed' | 'pending' | 'approved' | 'not-approved';

interface WorkReportStatusSummaryProps {
  reports: WorkReport[];
  activeFilter?: StatusFilter;
  onFilterChange?: (filter: StatusFilter) => void;
}

export const WorkReportStatusSummary = ({ 
  reports, 
  activeFilter = 'all',
  onFilterChange 
}: WorkReportStatusSummaryProps) => {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const totalSections: WorkReportSection[] = [
      'work_groups',
      'machinery_groups',
      'subcontract_groups',
      'observations'
    ];

    let completed = 0;
    let pending = 0;
    let approved = 0;
    let notApproved = 0;

    reports.forEach(report => {
      const completedSections = report.completedSections || [];
      const allSectionsCompleted = totalSections.every(section => 
        completedSections.includes(section)
      );

      // Estados explícitos de pendiente siempre cuentan como pendiente
      const isPendingStatus = report.status === 'missing_data' || 
                              report.status === 'missing_delivery_notes' ||
                              report.missingDeliveryNotes === true;

      if (!isPendingStatus && (allSectionsCompleted || report.status === 'completed')) {
        completed++;
        if (report.approved) {
          approved++;
        } else {
          notApproved++;
        }
      } else {
        pending++;
      }
    });

    const total = reports.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const approvalRate = completed > 0 ? Math.round((approved / completed) * 100) : 0;

    return {
      total,
      completed,
      pending,
      approved,
      notApproved,
      completionRate,
      approvalRate
    };
  }, [reports]);

  if (reports.length === 0) {
    return null;
  }

  const handleCardClick = (filter: StatusFilter) => {
    if (onFilterChange) {
      // Si ya está activo, volver a "todos"
      onFilterChange(activeFilter === filter ? 'all' : filter);
    }
  };

  const cardBaseStyles = "transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:shadow-md";
  const activeRingStyles = "ring-2 ring-offset-2 ring-offset-background";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
      {/* Total */}
      <Card 
        className={cn(
          cardBaseStyles,
          "bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20",
          activeFilter === 'all' && `${activeRingStyles} ring-slate-500`
        )}
        onClick={() => handleCardClick('all')}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t('workReports.total', 'Total partes')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-slate-600 dark:text-slate-400">
                {stats.total}
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-slate-500/20 flex items-center justify-center">
              <ListChecks className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
          <div className="mt-2">
            <Badge variant="outline" className="text-xs border-slate-500/30 text-slate-600 dark:text-slate-400">
              {activeFilter === 'all' ? 'Mostrando todos' : 'Ver todos'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Completados */}
      <Card 
        className={cn(
          cardBaseStyles,
          "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20",
          activeFilter === 'completed' && `${activeRingStyles} ring-emerald-500`
        )}
        onClick={() => handleCardClick('completed')}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t('workReports.completed', 'Completados')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.completed}
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="mt-2">
            <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              {stats.completionRate}% {t('common.total', 'del total')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Pendientes */}
      <Card 
        className={cn(
          cardBaseStyles,
          "bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20",
          activeFilter === 'pending' && `${activeRingStyles} ring-amber-500`
        )}
        onClick={() => handleCardClick('pending')}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t('workReports.pending', 'Pendientes')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
                {stats.pending}
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="mt-2">
            <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">
              {t('workReports.toReview', 'Por completar')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Aprobados (de los completados) */}
      <Card 
        className={cn(
          cardBaseStyles,
          "bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20",
          activeFilter === 'approved' && `${activeRingStyles} ring-blue-500`
        )}
        onClick={() => handleCardClick('approved')}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t('workReports.approved', 'Aprobados')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.approved}
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="mt-2">
            <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400">
              {stats.approvalRate}% de completados
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
