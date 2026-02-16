-- Añadir campo manager_name para permitir texto libre del gestor/transportista
ALTER TABLE public.work_report_waste_entries 
ADD COLUMN IF NOT EXISTS manager_name text;