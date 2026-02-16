-- Drop the existing restrictive policy for foremen
DROP POLICY IF EXISTS "Users can view reports in their organization STRICT" ON public.work_reports;

-- Create a new policy that allows foremen to see reports for their assigned works
-- regardless of who created them
CREATE POLICY "Users can view reports in their organization" 
ON public.work_reports 
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND organization_id = current_user_organization()
  AND (
    -- Admins and masters can see all reports in their org
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    -- Site managers can see completed reports
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND status = 'completed')
    -- Foremen can see reports for their assigned works (regardless of who created them)
    OR (has_role(auth.uid(), 'foreman'::app_role) AND work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
    -- Anyone can see their own reports
    OR created_by = auth.uid()
  )
);