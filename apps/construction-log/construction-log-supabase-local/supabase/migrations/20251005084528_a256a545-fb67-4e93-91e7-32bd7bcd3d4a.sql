-- Eliminar la política actual que restringe por fecha de creación
DROP POLICY IF EXISTS "Users can view assigned work reports" ON public.work_reports;

-- Crear nueva política que permite ver todos los partes de obras asignadas
CREATE POLICY "Users can view assigned work reports" 
ON public.work_reports 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (auth.uid() = created_by) 
  OR ((work_id IS NOT NULL) AND has_work_access(auth.uid(), work_id))
);