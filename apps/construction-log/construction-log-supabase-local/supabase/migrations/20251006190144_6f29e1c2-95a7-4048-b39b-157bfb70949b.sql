-- Ampliar la tabla works con información completa de la obra
ALTER TABLE public.works 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS promoter TEXT,
ADD COLUMN IF NOT EXISTS budget NUMERIC,
ADD COLUMN IF NOT EXISTS execution_period TEXT,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS contact_person TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Añadir comentarios descriptivos
COMMENT ON COLUMN public.works.address IS 'Dirección de la obra';
COMMENT ON COLUMN public.works.promoter IS 'Nombre del promotor';
COMMENT ON COLUMN public.works.budget IS 'Presupuesto total de la obra';
COMMENT ON COLUMN public.works.execution_period IS 'Plazo de ejecución (ej: "6 meses")';
COMMENT ON COLUMN public.works.start_date IS 'Fecha de inicio de la obra';
COMMENT ON COLUMN public.works.end_date IS 'Fecha prevista de finalización';
COMMENT ON COLUMN public.works.description IS 'Descripción general de la obra';
COMMENT ON COLUMN public.works.contact_person IS 'Persona de contacto';
COMMENT ON COLUMN public.works.contact_phone IS 'Teléfono de contacto';
COMMENT ON COLUMN public.works.contact_email IS 'Email de contacto';