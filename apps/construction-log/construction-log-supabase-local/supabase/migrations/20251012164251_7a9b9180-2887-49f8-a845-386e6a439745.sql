-- Eliminar la política actual de inserción
DROP POLICY IF EXISTS "Users can create their own reports in org" ON public.work_reports;

-- Crear nueva política de inserción que permita partes sin obra para roles privilegiados
CREATE POLICY "Users can create their own reports in org" 
ON public.work_reports 
FOR INSERT 
WITH CHECK (
  (organization_id = current_user_organization()) 
  AND (
    (created_by = auth.uid()) 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
  AND (
    -- Permitir sin work_id si es admin/master/site_manager
    work_id IS NULL 
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
);