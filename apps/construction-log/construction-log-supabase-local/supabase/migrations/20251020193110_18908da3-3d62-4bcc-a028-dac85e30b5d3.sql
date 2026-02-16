-- Drop existing policy for viewing inventory
DROP POLICY IF EXISTS "Users can view inventory of their works" ON public.work_inventory;

-- Create new policy that allows foreman to view all inventory in their organization
CREATE POLICY "Users can view inventory in their org"
ON public.work_inventory
FOR SELECT
USING (
  (organization_id = current_user_organization()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'foreman'::app_role)
    OR EXISTS (
      SELECT 1 FROM work_assignments wa 
      WHERE wa.work_id = work_inventory.work_id 
      AND wa.user_id = auth.uid()
    )
  )
);