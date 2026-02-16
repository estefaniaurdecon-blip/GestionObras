
-- Drop existing SELECT policy and recreate with clearer logic
DROP POLICY IF EXISTS "Users can view tasks in their org" ON public.calendar_tasks;

-- Create new policy that explicitly allows users assigned to the same work to view tasks
CREATE POLICY "Users can view tasks in their org"
ON public.calendar_tasks
FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (
    -- Task creator can always see their tasks
    created_by = auth.uid()
    -- User assigned to the task can see it
    OR assigned_to = auth.uid()
    -- Admins, masters and site managers can see all tasks
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    -- Users assigned to the same work can see tasks of that work
    OR (
      work_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM work_assignments wa 
        WHERE wa.work_id = calendar_tasks.work_id 
        AND wa.user_id = auth.uid()
      )
    )
  )
);
