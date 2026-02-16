-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can assign limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can revoke limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update limited roles" ON public.user_roles;

-- Admins can now assign: admin, foreman, site_manager, ofi, reader (NOT master)
CREATE POLICY "Admins can assign roles except master"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
);

CREATE POLICY "Admins can revoke roles except master"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
);

CREATE POLICY "Admins can update roles except master"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
)
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
);