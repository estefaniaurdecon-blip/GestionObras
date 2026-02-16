-- Añadir campos de dirección postal a la tabla works
ALTER TABLE public.works
ADD COLUMN IF NOT EXISTS street_address text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS province text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'España';