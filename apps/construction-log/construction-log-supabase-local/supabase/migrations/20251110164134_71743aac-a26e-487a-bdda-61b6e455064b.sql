-- Actualizar políticas RLS para access_control_reports
-- Los site_managers deben tener acceso solo a las obras asignadas

DROP POLICY IF EXISTS "Owners or admins can update access reports" ON public.access_control_reports;
DROP POLICY IF EXISTS "Owners or admins can delete access reports" ON public.access_control_reports;

-- UPDATE: Creador, admins/masters (todos), o site_managers asignados a la obra
CREATE POLICY "Users can update access reports based on assignment"
ON public.access_control_reports
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR (
      has_role(auth.uid(), 'site_manager'::app_role) 
      AND work_id IS NOT NULL 
      AND is_assigned_to_work(auth.uid(), work_id)
    )
  )
)
WITH CHECK (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR (
      has_role(auth.uid(), 'site_manager'::app_role) 
      AND work_id IS NOT NULL 
      AND is_assigned_to_work(auth.uid(), work_id)
    )
  )
);

-- DELETE: Creador, admins/masters (todos), o site_managers asignados a la obra
CREATE POLICY "Users can delete access reports based on assignment"
ON public.access_control_reports
FOR DELETE
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR (
      has_role(auth.uid(), 'site_manager'::app_role) 
      AND work_id IS NOT NULL 
      AND is_assigned_to_work(auth.uid(), work_id)
    )
  )
);