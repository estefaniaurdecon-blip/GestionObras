-- Eliminar política existente de SELECT
DROP POLICY IF EXISTS "Users can view access reports based on work assignment" ON access_control_reports;

-- Crear nueva política más restrictiva: solo admin/master ven todos, los demás solo ven de sus obras asignadas
CREATE POLICY "Users can view access reports of assigned works only"
ON access_control_reports
FOR SELECT
TO authenticated
USING (
  organization_id = current_user_organization() 
  AND (
    -- Admin y Master pueden ver todos los controles de su organización
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    -- Otros usuarios solo ven controles de obras a las que están asignados
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);

-- Actualizar política de UPDATE para ser consistente
DROP POLICY IF EXISTS "Users can update access reports based on assignment" ON access_control_reports;

CREATE POLICY "Users can update access reports of assigned works"
ON access_control_reports
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization() 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
)
WITH CHECK (
  organization_id = current_user_organization() 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);

-- Actualizar política de DELETE para ser consistente
DROP POLICY IF EXISTS "Users can delete access reports based on assignment" ON access_control_reports;

CREATE POLICY "Users can delete access reports of assigned works"
ON access_control_reports
FOR DELETE
TO authenticated
USING (
  organization_id = current_user_organization() 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);