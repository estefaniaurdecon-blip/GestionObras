-- Actualizar política RLS para que site_managers solo vean partes completados
-- Primero, eliminar la política existente de SELECT
DROP POLICY IF EXISTS "Users can view reports in org or assigned works" ON public.work_reports;

-- Crear nueva política que permite a site_managers ver solo partes completados
-- mientras que admin, master y creadores pueden ver todos
CREATE POLICY "Users can view reports with role-based filters"
ON public.work_reports
FOR SELECT
TO authenticated
USING (
  (
    -- Los creadores siempre pueden ver sus propios partes
    created_by = auth.uid()
  ) OR (
    -- Masters y Admins pueden ver todos los partes de su organización
    organization_id = current_user_organization() AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
  ) OR (
    -- Site Managers solo pueden ver partes completados de su organización
    organization_id = current_user_organization() AND 
    has_role(auth.uid(), 'site_manager'::app_role) AND
    status = 'completed'
  ) OR (
    -- Usuarios asignados a la obra pueden ver los partes de esa obra
    (work_id IS NOT NULL) AND 
    is_assigned_to_work(auth.uid(), work_id)
  )
);