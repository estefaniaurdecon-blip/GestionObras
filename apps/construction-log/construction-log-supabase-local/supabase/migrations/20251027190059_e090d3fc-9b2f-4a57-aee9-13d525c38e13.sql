-- Drop policies that depend on is_designated_master function
DROP POLICY IF EXISTS "Only designated master can assign master role" ON public.user_roles;
DROP POLICY IF EXISTS "Only designated master can revoke master role" ON public.user_roles;
DROP POLICY IF EXISTS "Only designated master can update master role" ON public.user_roles;

-- Now drop the function
DROP FUNCTION IF EXISTS public.is_designated_master();

-- Drop other existing policies
DROP POLICY IF EXISTS "Masters can assign any role except master" ON public.user_roles;
DROP POLICY IF EXISTS "Masters can revoke any role except master" ON public.user_roles;
DROP POLICY IF EXISTS "Masters can update any role except master" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can assign limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can revoke limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update limited roles" ON public.user_roles;

-- Masters can assign/revoke/update ANY role including master
CREATE POLICY "Masters can assign any role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
);

CREATE POLICY "Masters can revoke any role"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
);

CREATE POLICY "Masters can update any role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
)
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
);

-- Admins can assign foreman, site_manager, ofi, reader (NOT admin or master)
CREATE POLICY "Admins can assign limited roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
);

CREATE POLICY "Admins can revoke limited roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
);

CREATE POLICY "Admins can update limited roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
)
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role, 'ofi'::app_role)
);