-- Remove the old policy that allows site managers to update organizations
DROP POLICY IF EXISTS "Masters, Admins, and Site Managers can update their organizatio" ON public.organizations;

-- Create new policy that only allows masters and admins to update
CREATE POLICY "Only masters and admins can update organization" 
ON public.organizations 
FOR UPDATE 
USING (
  (id = current_user_organization()) 
  AND (has_role(auth.uid(), 'master'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  (id = current_user_organization()) 
  AND (has_role(auth.uid(), 'master'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);