// =====================================================
// TIPOS DE BASE DE DATOS - MÓDULO GESTIÓN DE RESIDUOS
// =====================================================

// ENUMs de la base de datos
export type WasteManagerCategory = 'transporter' | 'landfill' | 'container_rental' | 'recycler';
export type WasteOperationMode = 'container_management' | 'direct_transport';
export type WasteActionType = 'delivery' | 'withdrawal' | 'exchange' | 'load';
export type ContainerSizeDB = '3m3' | '6m3' | '12m3' | '30m3';

// Labels para los ENUMs
export const WASTE_MANAGER_CATEGORIES: Record<WasteManagerCategory, string> = {
  transporter: 'Transportista',
  landfill: 'Vertedero / Planta de tratamiento',
  container_rental: 'Alquiler de contenedores',
  recycler: 'Planta de reciclaje',
};

export const WASTE_OPERATION_MODES: Record<WasteOperationMode, string> = {
  container_management: 'Gestión de Contenedores',
  direct_transport: 'Transporte Directo',
};

export const WASTE_ACTION_TYPES: Record<WasteActionType, string> = {
  delivery: 'Entrega (Puesta)',
  withdrawal: 'Retirada',
  exchange: 'Cambio (Retirada + Puesta)',
  load: 'Carga',
};

export const CONTAINER_SIZES_DB: Record<ContainerSizeDB, string> = {
  '3m3': '3 m³',
  '6m3': '6 m³',
  '12m3': '12 m³',
  '30m3': '30 m³',
};

// =====================================================
// TABLA: waste_types (Tipos de Residuos)
// =====================================================
export interface WasteTypeDB {
  id: string;
  organization_id: string | null;
  name: string;
  ler_code: string | null;
  is_hazardous: boolean;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface WasteTypeInsert {
  id?: string;
  organization_id?: string | null;
  name: string;
  ler_code?: string | null;
  is_hazardous?: boolean;
  description?: string | null;
  is_system?: boolean;
}

export interface WasteTypeUpdate {
  name?: string;
  ler_code?: string | null;
  is_hazardous?: boolean;
  description?: string | null;
}

// =====================================================
// TABLA: waste_managers (Gestores y Transportistas)
// =====================================================
export interface WasteManagerDB {
  id: string;
  organization_id: string;
  company_name: string;
  fiscal_id: string | null;
  nima_number: string | null;
  authorization_number: string | null;
  category: WasteManagerCategory;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WasteManagerInsert {
  id?: string;
  organization_id: string;
  company_name: string;
  fiscal_id?: string | null;
  nima_number?: string | null;
  authorization_number?: string | null;
  category: WasteManagerCategory;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  is_active?: boolean;
  notes?: string | null;
  created_by?: string | null;
}

export interface WasteManagerUpdate {
  company_name?: string;
  fiscal_id?: string | null;
  nima_number?: string | null;
  authorization_number?: string | null;
  category?: WasteManagerCategory;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

// =====================================================
// TABLA: work_report_waste_entries (Movimientos)
// =====================================================
export interface WasteEntryDB {
  id: string;
  work_report_id: string;
  organization_id: string;
  work_id: string | null;
  operation_mode: WasteOperationMode;
  action_type: WasteActionType;
  waste_type_id: string | null;
  manager_id: string | null;
  container_id: string | null;
  container_size: ContainerSizeDB | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  operator_name: string | null;
  volume_m3: number | null;
  weight_tn: number | null;
  destination_plant: string | null;
  ticket_number: string | null;
  ticket_photo_url: string | null;
  manager_name: string | null;
  linked_entry_id: string | null;
  new_container_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WasteEntryInsert {
  id?: string;
  work_report_id: string;
  organization_id: string;
  work_id?: string | null;
  operation_mode: WasteOperationMode;
  action_type: WasteActionType;
  waste_type_id?: string | null;
  manager_id?: string | null;
  container_id?: string | null;
  container_size?: ContainerSizeDB | null;
  vehicle_plate?: string | null;
  vehicle_type?: string | null;
  operator_name?: string | null;
  volume_m3?: number | null;
  weight_tn?: number | null;
  destination_plant?: string | null;
  ticket_number?: string | null;
  ticket_photo_url?: string | null;
  manager_name?: string | null;
  linked_entry_id?: string | null;
  new_container_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

export interface WasteEntryUpdate {
  waste_type_id?: string | null;
  manager_id?: string | null;
  container_id?: string | null;
  container_size?: ContainerSizeDB | null;
  vehicle_plate?: string | null;
  vehicle_type?: string | null;
  operator_name?: string | null;
  volume_m3?: number | null;
  weight_tn?: number | null;
  destination_plant?: string | null;
  ticket_number?: string | null;
  ticket_photo_url?: string | null;
  manager_name?: string | null;
  notes?: string | null;
}

// =====================================================
// VISTA: active_containers (Contenedores Activos)
// =====================================================
export interface ActiveContainerView {
  container_id: string;
  container_size: ContainerSizeDB | null;
  waste_type_id: string | null;
  waste_type_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  work_id: string | null;
  work_name: string | null;
  delivery_date: string;
  organization_id: string;
}

// =====================================================
// TIPOS CON RELACIONES (para consultas con joins)
// =====================================================
export interface WasteEntryWithRelations extends WasteEntryDB {
  waste_type?: WasteTypeDB | null;
  manager?: WasteManagerDB | null;
}

// =====================================================
// HELPERS
// =====================================================
export const getManagerCategoryLabel = (category: WasteManagerCategory): string => {
  return WASTE_MANAGER_CATEGORIES[category] || category;
};

export const getOperationModeLabel = (mode: WasteOperationMode): string => {
  return WASTE_OPERATION_MODES[mode] || mode;
};

export const getActionTypeLabel = (action: WasteActionType): string => {
  return WASTE_ACTION_TYPES[action] || action;
};

export const getContainerSizeDBLabel = (size: ContainerSizeDB): string => {
  return CONTAINER_SIZES_DB[size] || size;
};

// Check if waste type is hazardous (shows warning icon)
export const isHazardousWaste = (wasteType: WasteTypeDB | null): boolean => {
  return wasteType?.is_hazardous ?? false;
};

// Format LER code for display (XX XX XX format)
export const formatLerCode = (code: string | null): string => {
  if (!code) return '';
  const clean = code.replace(/[^0-9*]/g, '');
  if (clean.length >= 6) {
    return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4)}`;
  }
  return code;
};
