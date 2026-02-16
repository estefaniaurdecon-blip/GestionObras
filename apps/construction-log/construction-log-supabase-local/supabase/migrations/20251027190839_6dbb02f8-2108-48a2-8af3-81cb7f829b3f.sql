-- Update work_reports policy to ensure foremen can view all reports from assigned works
DROP POLICY IF EXISTS "Users can view reports in their organization" ON public.work_reports;

CREATE POLICY "Users can view reports in their organization"
ON public.work_reports
FOR SELECT
TO authenticated
USING (
  organization_id = current_user_organization()
  AND (
    -- Creator can always view their own reports
    created_by = auth.uid()
    -- Masters and admins can view all reports in their org
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    -- Site managers can view completed reports
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND status = 'completed')
    -- Foremen can view ALL reports from works they are assigned to
    OR (
      has_role(auth.uid(), 'foreman'::app_role) 
      AND work_id IS NOT NULL 
      AND is_assigned_to_work(auth.uid(), work_id)
    )
    -- Users assigned to a work can view its reports (fallback for other roles)
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);