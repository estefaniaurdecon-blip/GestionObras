import { WasteLogEntry } from './wasteManagement';

export interface WorkItem {
  id: string;
  name: string;
  activity: string;
  hours: number;
  hourlyRate?: number;
  total: number;
}

export interface MachineryItem {
  id: string;
  type: string;
  activity: string;
  hours: number;
  hourlyRate?: number;
  total: number;
}

export interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

// Trabajador individual de subcontrata
export interface SubcontractWorker {
  id: string;
  name: string; // Nombre y apellidos
  dni: string;
  category: string; // Cargo/Categoría
  hours?: number;
}

export interface SubcontractItem {
  id: string;
  contractedPart: string;
  company: string;
  activity: string;
  workers: number;
  hours: number;
  hourlyRate?: number;
  total: number;
  unitType?: 'hora' | 'm3' | 'm2' | 'ml' | 'unidad';
  quantity?: number;
  unitPrice?: number;
  workerDetails?: SubcontractWorker[]; // Lista de trabajadores con detalles
}

export interface SubcontractGroup {
  id: string;
  company: string;
  items: SubcontractItem[];
  documentImage?: string;
  totalWorkers?: number;
}

export interface WorkGroup {
  id: string;
  company: string;
  items: WorkItem[];
  documentImage?: string;
}

export interface MachineryGroup {
  id: string;
  company: string;
  items: MachineryItem[];
  documentImage?: string;
}

export interface MaterialGroup {
  id: string;
  supplier: string;
  invoiceNumber: string;
  items: MaterialItem[];
  documentImage?: string;
  extractedDate?: string; // Fecha extraída del albarán por IA
}

// Entrada de encargado/capataz/recurso preventivo con horas
export interface ForemanEntry {
  id: string;
  name: string;
  role: 'encargado' | 'capataz' | 'recurso_preventivo';
  hours: number;
}

export type WorkReportSection = 
  | 'general_info' 
  | 'work_groups' 
  | 'machinery_groups' 
  | 'material_groups' 
  | 'subcontract_groups' 
  | 'rental_machinery' 
  | 'observations';

export interface WorkReport {
  id: string;
  workNumber: string;
  date: string;
  workName: string;
  workId?: string; // UUID de la obra asignada
  foreman: string;
  foremanHours: number;
  foremanEntries?: ForemanEntry[]; // Múltiples encargados/capataces con horas
  foremanSignature?: string;
  siteManager: string;
  siteManagerSignature?: string;
  observations: string;
  workGroups: WorkGroup[];
  machineryGroups: MachineryGroup[];
  materialGroups: MaterialGroup[];
  subcontractGroups: SubcontractGroup[];
  wasteLog?: WasteLogEntry[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  approved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  lastEditedBy?: string; // Jefe de obra que editó el parte
  lastEditedAt?: string; // Fecha y hora de la última edición
  status?: 'completed' | 'missing_data' | 'missing_delivery_notes';
  missingDeliveryNotes?: boolean;
  autoCloneNextDay?: boolean;
  completedSections?: WorkReportSection[];
  // Archivado
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
}

export interface CompanySettings {
  logo?: string;
  name?: string;
}