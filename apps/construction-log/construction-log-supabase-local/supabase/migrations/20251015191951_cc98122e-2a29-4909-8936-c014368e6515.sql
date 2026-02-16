-- Modificar la columna company_type para soportar múltiples tipos
ALTER TABLE public.company_portfolio 
ALTER COLUMN company_type TYPE text[] 
USING ARRAY[company_type]::text[];