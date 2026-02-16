-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Org admins/managers can manage assignments" ON public.work_assignments;

-- Create separate policies for more granular control
-- Allow admins, site managers, and masters to manage all assignments
CREATE POLICY "Admins and managers can insert assignments"
ON public.work_assignments
FOR INSERT
WITH CHECK (
  (organization_id = current_user_organization()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

CREATE POLICY "Admins and managers can update assignments"
ON public.work_assignments
FOR UPDATE
USING (
  (organization_id = current_user_organization()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
)
WITH CHECK (
  (organization_id = current_user_organization()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

CREATE POLICY "Admins and managers can delete assignments"
ON public.work_assignments
FOR DELETE
USING (
  (organization_id = current_user_organization()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);