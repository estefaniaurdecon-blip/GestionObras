-- Agregar campo para marcar partes que se deben clonar automáticamente
ALTER TABLE public.work_reports 
ADD COLUMN auto_clone_next_day boolean NOT NULL DEFAULT false;

-- Crear índice para mejorar el rendimiento de la consulta del cron job
CREATE INDEX idx_work_reports_auto_clone ON public.work_reports(auto_clone_next_day, date) 
WHERE auto_clone_next_day = true;