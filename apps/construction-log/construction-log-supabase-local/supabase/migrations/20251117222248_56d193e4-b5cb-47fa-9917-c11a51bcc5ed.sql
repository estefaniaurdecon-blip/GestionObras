-- Agregar campo de fecha de fin a las asignaciones de maquinaria
ALTER TABLE public.work_rental_machinery_assignments
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Crear un índice compuesto para búsquedas eficientes por rango de fechas
CREATE INDEX IF NOT EXISTS idx_rental_machinery_assignments_date_range 
ON public.work_rental_machinery_assignments(rental_machinery_id, assignment_date, end_date);