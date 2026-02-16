-- Drop the existing policy for viewing work reports
DROP POLICY IF EXISTS "Users can view reports in their organization STRICT" ON work_reports;

-- Create updated policy that restricts foremen to only their own reports in assigned works
CREATE POLICY "Users can view reports in their organization STRICT"
ON work_reports
FOR SELECT
TO authenticated
USING (
  (organization_id IS NOT NULL) 
  AND (organization_id = current_user_organization()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role) 
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND (status = 'completed'::text))
    OR (has_role(auth.uid(), 'foreman'::app_role) AND (created_by = auth.uid()) AND (work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), work_id))
  )
);