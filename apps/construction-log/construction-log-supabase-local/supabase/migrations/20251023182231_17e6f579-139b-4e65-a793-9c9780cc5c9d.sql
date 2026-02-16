-- Create RLS policy for work_reports to allow 'ofi' role to view approved and signed reports
CREATE POLICY "Ofi role can view approved and signed reports"
ON public.work_reports
FOR SELECT
USING (
  organization_id = current_user_organization() 
  AND approved = true 
  AND site_manager_signature IS NOT NULL
  AND has_role(auth.uid(), 'ofi'::app_role)
);

-- Allow ofi role to view users in their organization
CREATE POLICY "Ofi can view organization profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'ofi'::app_role) 
  AND organization_id = current_user_organization()
);