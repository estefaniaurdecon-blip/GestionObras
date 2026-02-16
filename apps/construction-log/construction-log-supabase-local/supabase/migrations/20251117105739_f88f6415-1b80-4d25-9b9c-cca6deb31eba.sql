-- Agregar campos para tracking de ediciones en work_reports
ALTER TABLE work_reports
ADD COLUMN last_edited_by uuid REFERENCES auth.users(id),
ADD COLUMN last_edited_at timestamp with time zone;

-- Crear índice para mejorar consultas
CREATE INDEX idx_work_reports_last_edited_by ON work_reports(last_edited_by);

-- Comentarios para documentación
COMMENT ON COLUMN work_reports.last_edited_by IS 'Usuario que realizó la última edición (diferente al creador)';
COMMENT ON COLUMN work_reports.last_edited_at IS 'Fecha y hora de la última edición';