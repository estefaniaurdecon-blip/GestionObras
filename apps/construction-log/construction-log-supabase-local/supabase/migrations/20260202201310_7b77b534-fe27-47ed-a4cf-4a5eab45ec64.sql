-- Añadir columnas de coordenadas a la tabla de obras
ALTER TABLE public.works 
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision;