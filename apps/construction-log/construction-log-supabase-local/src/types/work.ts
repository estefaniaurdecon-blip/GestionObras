/**
 * Centralized Work interface
 * This should be the single source of truth for Work type definitions
 */
export interface Work {
  id: string;
  number: string;
  name: string;
  address?: string;
  promoter?: string;
  budget?: number;
  execution_period?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  created_at: string;
  created_by: string;
  organization_id?: string;
  updated_at?: string;
  // Coordenadas para geolocalización
  latitude?: number;
  longitude?: number;
  // Campos de dirección postal
  street_address?: string;
  city?: string;
  province?: string;
  country?: string;
}

/**
 * Simplified Work interface for list views
 * Contains only essential fields for display purposes
 */
export interface WorkBasic {
  id: string;
  name: string;
  number: string;
  created_at?: string;
  updated_at?: string;
}
