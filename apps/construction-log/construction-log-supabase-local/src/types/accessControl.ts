export interface AccessEntry {
  id: string;
  type: 'personal' | 'machinery';
  name: string; // Nombre de persona o tipo de máquina
  identifier: string; // DNI para personal, matrícula para maquinaria
  company: string;
  entryTime: string; // HH:MM
  exitTime?: string; // HH:MM opcional
  activity: string; // Actividad o puesto
  operator?: string; // Solo para maquinaria
  signature?: string; // Firma digital en base64 (solo para personal)
  source?: 'subcontract' | 'rental'; // Origen de la maquinaria: subcontrata o alquiler
}

export interface AccessReport {
  id: string;
  date: string; // YYYY-MM-DD
  siteName: string;
  workId?: string; // UUID de la obra asociada
  responsible: string;
  responsibleEntryTime?: string; // HH:MM
  responsibleExitTime?: string; // HH:MM
  observations: string;
  additionalTasks?: string; // Notas de tareas adicionales
  personalEntries: AccessEntry[];
  machineryEntries: AccessEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AccessSummary {
  totalPersonal: number;
  totalMachinery: number;
  companies: string[];
  totalHours: number;
}
