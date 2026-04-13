import { useState, useMemo } from 'react';
import { WorkReport, WorkReportSection } from '@/types/workReport';
import { StatusFilter } from '@/components/WorkReportStatusSummary';

export interface UseWorkReportListFiltersParams {
  reports: WorkReport[];
  isOfi: boolean;
  isAdmin: boolean;
  isMaster: boolean;
}

export interface UseWorkReportListFiltersResult {
  // Filter states + setters
  selectedWorkFilter: string;
  setSelectedWorkFilter: (v: string) => void;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: (v: boolean) => void;
  dateFilterStart: string;
  setDateFilterStart: (v: string) => void;
  dateFilterEnd: string;
  setDateFilterEnd: (v: string) => void;
  approvalFilter: 'all' | 'approved' | 'not-approved';
  setApprovalFilter: (v: 'all' | 'approved' | 'not-approved') => void;
  foremanFilter: string;
  setForemanFilter: (v: string) => void;
  siteManagerFilter: string;
  setSiteManagerFilter: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  // Computed
  archivedReports: WorkReport[];
  reportsForStats: WorkReport[];
  filteredReports: WorkReport[];
  uniqueForemen: string[];
  uniqueSiteManagers: string[];
  // Actions
  clearAllFilters: () => void;
}

export function useWorkReportListFilters({
  reports,
  isOfi,
  isAdmin,
  isMaster,
}: UseWorkReportListFiltersParams): UseWorkReportListFiltersResult {
  const [selectedWorkFilter, setSelectedWorkFilter] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFilterStart, setDateFilterStart] = useState<string>('');
  const [dateFilterEnd, setDateFilterEnd] = useState<string>('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'approved' | 'not-approved'>('all');
  const [foremanFilter, setForemanFilter] = useState<string>('');
  const [siteManagerFilter, setSiteManagerFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Filtrar partes archivados (para el dialog)
  const archivedReports = useMemo(() => {
    return reports.filter(r => r.isArchived === true);
  }, [reports]);

  // Reportes base para las estadísticas (respetando el rol del usuario)
  // El rol ofi solo debe ver estadísticas de reportes con status='completed'
  const reportsForStats = useMemo(() => {
    let baseReports = reports.filter(r => !r.isArchived);

    // Si el usuario es solo ofi (no admin ni master), filtrar a solo completed
    if (isOfi && !isAdmin && !isMaster) {
      baseReports = baseReports.filter(r => r.status === 'completed');
    }

    return baseReports;
  }, [reports, isOfi, isAdmin, isMaster]);

  // Filtrar reportes con todos los filtros aplicados (excluyendo archivados)
  const filteredReports = useMemo(() => {
    // Secciones que cuentan para determinar si está completado
    const totalSections: WorkReportSection[] = [
      'work_groups',
      'machinery_groups',
      'subcontract_groups',
      'observations'
    ];

    // PRIMERO: Excluir partes archivados
    let filtered = reports.filter(r => !r.isArchived);

    // Filtro por estado desde las tarjetas de resumen
    if (statusFilter !== 'all') {
      filtered = filtered.filter(report => {
        const completedSections = report.completedSections || [];
        const allSectionsCompleted = totalSections.every(section =>
          completedSections.includes(section)
        );
        const isCompleted = allSectionsCompleted || report.status === 'completed';

        switch (statusFilter) {
          case 'completed':
            return isCompleted;
          case 'pending':
            return !isCompleted;
          case 'approved':
            return isCompleted && report.approved === true;
          case 'not-approved':
            return isCompleted && !report.approved;
          default:
            return true;
        }
      });
    }

    // Filtro por obra
    if (selectedWorkFilter && selectedWorkFilter !== 'all') {
      filtered = filtered.filter(r => r.workId === selectedWorkFilter);
    }

    // Filtro por rango de fechas
    if (dateFilterStart) {
      filtered = filtered.filter(r => new Date(r.date) >= new Date(dateFilterStart));
    }
    if (dateFilterEnd) {
      filtered = filtered.filter(r => new Date(r.date) <= new Date(dateFilterEnd));
    }

    // Filtro por estado de aprobación (del filtro avanzado)
    if (approvalFilter === 'approved') {
      filtered = filtered.filter(r => r.approved === true);
    } else if (approvalFilter === 'not-approved') {
      filtered = filtered.filter(r => !r.approved);
    }

    // Filtro por encargado (normalizado a Title Case)
    if (foremanFilter && foremanFilter !== 'all') {
      filtered = filtered.filter(r => {
        const normalizedForeman = r.foreman
          ?.toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return normalizedForeman === foremanFilter;
      });
    }

    // Filtro por jefe de obra (normalizado a Title Case)
    if (siteManagerFilter && siteManagerFilter !== 'all') {
      filtered = filtered.filter(r => {
        const normalizedSiteManager = r.siteManager
          ?.toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return normalizedSiteManager === siteManagerFilter;
      });
    }

    return filtered;
  }, [reports, statusFilter, selectedWorkFilter, dateFilterStart, dateFilterEnd, approvalFilter, foremanFilter, siteManagerFilter]);

  // Obtener lista única de encargados
  const uniqueForemen = useMemo(() => {
    const foremenSet = new Set<string>();
    reports.forEach(report => {
      if (report.foreman) {
        const normalized = report.foreman
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        foremenSet.add(normalized);
      }
    });
    return Array.from(foremenSet).sort();
  }, [reports]);

  // Obtener lista única de jefes de obra
  const uniqueSiteManagers = useMemo(() => {
    const managersSet = new Set<string>();
    reports.forEach(report => {
      if (report.siteManager) {
        const normalized = report.siteManager
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        managersSet.add(normalized);
      }
    });
    return Array.from(managersSet).sort();
  }, [reports]);

  const clearAllFilters = () => {
    setSelectedWorkFilter('');
    setDateFilterStart('');
    setDateFilterEnd('');
    setApprovalFilter('all');
    setForemanFilter('');
    setSiteManagerFilter('');
  };

  return {
    selectedWorkFilter,
    setSelectedWorkFilter,
    showAdvancedFilters,
    setShowAdvancedFilters,
    dateFilterStart,
    setDateFilterStart,
    dateFilterEnd,
    setDateFilterEnd,
    approvalFilter,
    setApprovalFilter,
    foremanFilter,
    setForemanFilter,
    siteManagerFilter,
    setSiteManagerFilter,
    statusFilter,
    setStatusFilter,
    archivedReports,
    reportsForStats,
    filteredReports,
    uniqueForemen,
    uniqueSiteManagers,
    clearAllFilters,
  };
}
