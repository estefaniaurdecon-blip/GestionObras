-- Drop the existing restrictive policy for office role
DROP POLICY IF EXISTS "Ofi can view completed approved reports STRICT" ON public.work_reports;

-- Create a new policy that allows office role to view all completed reports (approved or not)
CREATE POLICY "Ofi can view completed reports"
ON public.work_reports
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND organization_id = current_user_organization()
  AND status = 'completed'
  AND has_role(auth.uid(), 'ofi'::app_role)
);