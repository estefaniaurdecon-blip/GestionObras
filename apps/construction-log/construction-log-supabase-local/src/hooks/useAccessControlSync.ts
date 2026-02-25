import { useEffect, useCallback } from 'react';
import { WorkReport } from '@/types/workReport';
import { AccessEntry } from '@/types/accessControl';
import { useAuth } from '@/contexts/AuthContext';
import { WorkRentalMachinery } from '@/hooks/useWorkRentalMachinery';

interface UseAccessControlSyncProps {
  workReport: WorkReport | undefined;
  enabled: boolean;
}

export const useAccessControlSync = ({ workReport, enabled }: UseAccessControlSyncProps) => {
  const { user } = useAuth();

  // Función para comparar entradas de personal (ignorando IDs)
  const comparePersonalEntries = (existing: AccessEntry[], newEntries: AccessEntry[]): boolean => {
    if (existing.length !== newEntries.length) return false;
    
    const normalize = (entries: AccessEntry[]) => 
      entries.map(e => `${e.name}|${e.company}|${e.activity}`).sort();
    
    const existingNorm = normalize(existing);
    const newNorm = normalize(newEntries);
    
    return existingNorm.every((val, idx) => val === newNorm[idx]);
  };

  // Función para comparar entradas de maquinaria (ignorando IDs)
  const compareMachineryEntries = (existing: AccessEntry[], newEntries: AccessEntry[]): boolean => {
    if (existing.length !== newEntries.length) return false;
    
    const normalize = (entries: AccessEntry[]) => 
      entries.map(e => `${e.name}|${e.identifier}|${e.company}|${e.activity}|${e.operator || ''}`).sort();
    
    const existingNorm = normalize(existing);
    const newNorm = normalize(newEntries);
    
    return existingNorm.every((val, idx) => val === newNorm[idx]);
  };

  const syncAccessControl = useCallback(async (report: WorkReport) => {
    if (!enabled || !report.workId || !report.date || !user?.id) return;

    try {
      // Obtener organización y nombre del usuario actual
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, full_name')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) return;

      // Buscar control de accesos existente para esa fecha y obra
      const { data: existingReport } = await supabase
        .from('access_control_reports')
        .select('*')
        .eq('date', report.date)
        .eq('work_id', report.workId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

      // Helper para calcular hora de salida basada en hora de entrada y horas trabajadas
      const calculateExitTime = (entryTime: string, hours: number): string => {
        if (!hours || hours <= 0) return '';
        const [entryHour, entryMinute] = entryTime.split(':').map(Number);
        // Si las horas son más de 6, añadir 1 hora de descanso
        const totalHours = hours > 6 ? hours + 1 : hours;
        const totalMinutes = entryHour * 60 + entryMinute + totalHours * 60;
        const exitHour = Math.floor(totalMinutes / 60) % 24;
        const exitMinute = Math.floor(totalMinutes % 60);
        return `${exitHour.toString().padStart(2, '0')}:${exitMinute.toString().padStart(2, '0')}`;
      };

      // Convertir work_groups a personal_entries
      const personalFromWorkGroups: AccessEntry[] = (report.workGroups || []).flatMap(group => 
        group.items.map(worker => {
          const entryTime = '08:00';
          const exitTime = calculateExitTime(entryTime, worker.hours);
          return {
            id: crypto.randomUUID(),
            type: 'personal' as const,
            name: worker.name,
            identifier: '', // WorkItem no tiene DNI, dejarlo vacío
            company: group.company,
            entryTime,
            exitTime,
            activity: worker.activity,
            signature: undefined
          };
        })
      );

      // Convertir subcontract_groups a personal_entries (trabajadores detallados de subcontratas)
      const personalFromSubcontracts: AccessEntry[] = (report.subcontractGroups || []).flatMap(group => 
        group.items.flatMap(item => {
          // Si hay workerDetails, usar esos datos
          if (item.workerDetails && item.workerDetails.length > 0) {
            return item.workerDetails.map(worker => {
              const entryTime = '08:00';
              const exitTime = calculateExitTime(entryTime, worker.hours || item.hours || 0);
              return {
                id: crypto.randomUUID(),
                type: 'personal' as const,
                name: worker.name,
                identifier: worker.dni || '',
                company: group.company,
                entryTime,
                exitTime,
                activity: item.activity || item.contractedPart || '',
                category: worker.category || '',
                signature: undefined
              };
            });
          }
          // Si no hay workerDetails pero hay workers > 0, crear entradas genéricas
          if (item.workers && item.workers > 0) {
            return Array.from({ length: item.workers }, (_, index) => {
              const entryTime = '08:00';
              const exitTime = calculateExitTime(entryTime, item.hours || 0);
              return {
                id: crypto.randomUUID(),
                type: 'personal' as const,
                name: `Trabajador ${index + 1}`,
                identifier: '',
                company: group.company,
                entryTime,
                exitTime,
                activity: item.activity || item.contractedPart || '',
                signature: undefined
              };
            });
          }
          return [];
        })
      );

      const personalEntries: AccessEntry[] = [...personalFromWorkGroups, ...personalFromSubcontracts];

      // Obtener maquinaria de alquiler asignada a esta obra
      const { data: rentalMachinery } = await supabase
        .from('work_rental_machinery')
        .select('*')
        .eq('work_id', report.workId)
        .eq('organization_id', profile.organization_id)
        .lte('delivery_date', report.date)
        .or(`removal_date.is.null,removal_date.gte.${report.date}`);

      // Obtener asignaciones de operadores para esta fecha
      const { data: rentalAssignments } = await supabase
        .from('work_rental_machinery_assignments')
        .select('*')
        .eq('work_id', report.workId)
        .eq('organization_id', profile.organization_id)
        .lte('assignment_date', report.date)
        .or(`end_date.is.null,end_date.gte.${report.date}`);

      // Convertir machinery_groups y rental_machinery a machinery_entries
      const machineryFromGroups: AccessEntry[] = (report.machineryGroups || []).flatMap(group =>
        group.items.map(item => {
          const entryTime = '08:00';
          const exitTime = calculateExitTime(entryTime, item.hours);
          return {
            id: crypto.randomUUID(),
            type: 'machinery' as const,
            name: item.type,
            identifier: '', // MachineryItem no tiene matrícula
            company: group.company,
            entryTime,
            exitTime,
            activity: item.activity,
            operator: 'Operador incluido', // Maquinaria de subcontrata viene con operador
            source: 'subcontract' as const
          };
        })
      );

      // Crear mapa de asignaciones por rental_machinery_id
      const assignmentMap = new Map(
        (rentalAssignments || []).map(assignment => [
          assignment.rental_machinery_id,
          assignment
        ])
      );

      const machineryFromRental: AccessEntry[] = (rentalMachinery || []).map(machine => {
        const assignment = assignmentMap.get(machine.id);
        
        return {
          id: crypto.randomUUID(),
          type: 'machinery' as const,
          name: machine.type,
          identifier: machine.machine_number,
          company: assignment ? assignment.company_name : machine.provider,
          entryTime: '08:00',
          exitTime: '',
          activity: assignment ? assignment.activity || 'Maquinaria de Alquiler' : 'Maquinaria de Alquiler',
          operator: assignment ? assignment.operator_name : undefined,
          source: 'rental' as const
        };
      });

      const allMachineryEntries = [...machineryFromGroups, ...machineryFromRental];

      if (existingReport) {
        // Ya existe un control de accesos - solo actualizar si hay cambios en personal o maquinaria
        const existingPersonal = (existingReport.personal_entries as unknown as AccessEntry[]) || [];
        const existingMachinery = (existingReport.machinery_entries as unknown as AccessEntry[]) || [];
        
        const personalChanged = !comparePersonalEntries(existingPersonal, personalEntries);
        const machineryChanged = !compareMachineryEntries(existingMachinery, allMachineryEntries);
        
        if (!personalChanged && !machineryChanged) {
          console.log('[AccessControlSync] Sin cambios en personal ni maquinaria, no se actualiza el control de accesos');
          return;
        }

        // Preparar datos de actualización - solo las secciones que cambiaron
        const updateData: any = {
          updated_at: new Date().toISOString()
        };

        if (personalChanged) {
          updateData.personal_entries = personalEntries;
          console.log('[AccessControlSync] Actualizando personal en control de accesos');
        }

        if (machineryChanged) {
          updateData.machinery_entries = allMachineryEntries;
          console.log('[AccessControlSync] Actualizando maquinaria en control de accesos');
        }

        const { error } = await supabase
          .from('access_control_reports')
          .update(updateData)
          .eq('id', existingReport.id);

        if (error) throw error;
        console.log('[AccessControlSync] Control de accesos actualizado (solo secciones modificadas):', existingReport.id);
      } else {
        // No existe control de accesos - crear uno nuevo si hay entradas
        if (personalEntries.length > 0 || allMachineryEntries.length > 0) {
          const accessControlData = {
            date: report.date,
            site_name: report.workName,
            work_id: report.workId,
            responsible: profile.full_name || report.foreman || '',
            responsible_entry_time: null,
            responsible_exit_time: null,
            observations: report.observations || '',
            personal_entries: personalEntries as any,
            machinery_entries: allMachineryEntries as any,
            organization_id: profile.organization_id,
            created_by: user.id
          };

          const { error } = await supabase
            .from('access_control_reports')
            .insert([accessControlData] as any);

          if (error) throw error;
          console.log('[AccessControlSync] Control de accesos creado automáticamente con', personalEntries.length, 'personal y', allMachineryEntries.length, 'maquinaria');
        } else {
          console.log('[AccessControlSync] No hay personal ni maquinaria para crear control de accesos');
        }
      }
    } catch (error) {
      console.error('[AccessControlSync] Error al sincronizar control de accesos:', error);
    }
  }, [enabled, user?.id]);

  useEffect(() => {
    if (!enabled) return;

    // Listener para forzar sincronización SOLO desde evento personalizado (confirmación del usuario)
    const handleSyncEvent = (event: CustomEvent) => {
      const { report } = event.detail as { report: WorkReport; isNewReport: boolean };
      syncAccessControl(report);
    };

    window.addEventListener('sync-access-control', handleSyncEvent as EventListener);

    return () => {
      window.removeEventListener('sync-access-control', handleSyncEvent as EventListener);
    };
  }, [syncAccessControl, enabled]);

  return { syncAccessControl };
};
