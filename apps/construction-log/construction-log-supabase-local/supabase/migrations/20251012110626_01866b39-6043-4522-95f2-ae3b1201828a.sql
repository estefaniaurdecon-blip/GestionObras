-- Update organization policies to allow masters, admins, and site_managers to update
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;

CREATE POLICY "Masters, Admins, and Site Managers can update their organization" 
ON public.organizations 
FOR UPDATE 
USING (
  id = current_user_organization() 
  AND (
    has_role(auth.uid(), 'master') 
    OR has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'site_manager')
  )
)
WITH CHECK (
  id = current_user_organization() 
  AND (
    has_role(auth.uid(), 'master') 
    OR has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'site_manager')
  )
);