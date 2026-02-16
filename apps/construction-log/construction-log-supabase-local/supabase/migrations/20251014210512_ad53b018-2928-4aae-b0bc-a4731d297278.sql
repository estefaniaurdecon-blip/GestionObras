-- Relax INSERT policy to avoid failing when organization_id is null
DROP POLICY IF EXISTS "Users can share files within organization" ON public.shared_files;
CREATE POLICY "Users can share files within organization"
ON public.shared_files
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = from_user_id
  AND same_organization(to_user_id)
  AND (organization_id IS NULL OR organization_id = current_user_organization())
);
