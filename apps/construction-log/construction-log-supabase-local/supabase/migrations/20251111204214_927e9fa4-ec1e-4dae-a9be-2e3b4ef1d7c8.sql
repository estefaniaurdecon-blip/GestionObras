-- Actualizar política RLS para rol ofi: solo partes completados
DROP POLICY IF EXISTS "Ofi can view approved signed reports STRICT" ON work_reports;

CREATE POLICY "Ofi can view completed approved reports STRICT"
ON work_reports
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND organization_id = current_user_organization()
  AND status = 'completed'
  AND approved = true
  AND has_role(auth.uid(), 'ofi'::app_role)
);