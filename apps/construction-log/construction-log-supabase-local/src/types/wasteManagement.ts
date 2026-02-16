// Waste Management Types for RCD (Residuos de Construcción y Demolición)

export type WasteEntryType = 'container' | 'transport';

export type ContainerAction = 'delivery' | 'withdrawal' | 'change';
export type TransportAction = 'load';

export type WasteType = 
  | 'mezcla' 
  | 'hormigon' 
  | 'madera' 
  | 'peligrosos' 
  | 'metalico' 
  | 'plastico'
  | 'tierra'
  | 'escombro';

export type ContainerSize = '3m3' | '6m3' | '12m3' | '30m3';

export type VehicleType = 
  | 'camion_banera' 
  | 'camion_centauro' 
  | 'dumper' 
  | 'camion_grua'
  | 'otro';

export interface WasteLogEntry {
  id: string;
  type: WasteEntryType;
  action: ContainerAction | TransportAction;
  waste_type: WasteType;
  volume?: number;
  volume_unit?: 'm3' | 'tn';
  // Container specific
  container_id?: string;
  container_size?: ContainerSize;
  // Transport specific
  vehicle_type?: VehicleType;
  vehicle_plate?: string;
  operator_name?: string;
  // Common
  provider_company?: string;
  provider_id?: string;
  destination?: string;
  notes?: string;
  created_at: string;
  // For container changes - links withdrawal to new delivery
  linked_container_id?: string;
}

// Container sizes with labels
export const CONTAINER_SIZES: Record<ContainerSize, string> = {
  '3m3': '3 m³',
  '6m3': '6 m³',
  '12m3': '12 m³',
  '30m3': '30 m³',
};

// Waste types with labels
export const WASTE_TYPES: Record<WasteType, string> = {
  'mezcla': 'Mezcla RCD',
  'hormigon': 'Hormigón',
  'madera': 'Madera',
  'peligrosos': 'Residuos Peligrosos',
  'metalico': 'Metálico',
  'plastico': 'Plástico',
  'tierra': 'Tierras',
  'escombro': 'Escombro',
};

// Vehicle types with labels and icons
export const VEHICLE_TYPES: Record<VehicleType, { label: string; icon: string }> = {
  'camion_banera': { label: 'Camión Bañera', icon: '🚛' },
  'camion_centauro': { label: 'Camión Centauro', icon: '🚚' },
  'dumper': { label: 'Dúmper', icon: '🚜' },
  'camion_grua': { label: 'Camión Grúa', icon: '🏗️' },
  'otro': { label: 'Otro', icon: '🚗' },
};

// Container actions with labels
export const CONTAINER_ACTIONS: Record<ContainerAction, string> = {
  'delivery': 'Entrega (Puesta)',
  'withdrawal': 'Retirada',
  'change': 'Cambio (Retirada + Puesta)',
};

// Helper to get action label for display
export const getActionLabel = (action: ContainerAction | TransportAction): string => {
  if (action === 'load') return 'Carga';
  return CONTAINER_ACTIONS[action as ContainerAction] || action;
};

// Helper to get waste type label
export const getWasteTypeLabel = (wasteType: WasteType): string => {
  return WASTE_TYPES[wasteType] || wasteType;
};

// Helper to get vehicle type info
export const getVehicleTypeInfo = (vehicleType: VehicleType): { label: string; icon: string } => {
  return VEHICLE_TYPES[vehicleType] || { label: vehicleType, icon: '🚗' };
};

// Helper to get container size label
export const getContainerSizeLabel = (size: ContainerSize): string => {
  return CONTAINER_SIZES[size] || size;
};
