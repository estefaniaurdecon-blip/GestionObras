-- Función para verificar si el usuario es el master designado
CREATE OR REPLACE FUNCTION public.is_designated_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND email = 'antoniojbautista@hotmail.es'
  )
$$;

-- Eliminar TODAS las políticas de user_roles
DROP POLICY IF EXISTS "Org admins or masters can assign roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can revoke roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can view organization roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Site managers can assign foreman and reader" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can assign limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Masters can assign any role except master" ON public.user_roles;
DROP POLICY IF EXISTS "Only designated master can assign master role" ON public.user_roles;
DROP POLICY IF EXISTS "Site managers can revoke foreman and reader" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can revoke limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Masters can revoke any role except master" ON public.user_roles;
DROP POLICY IF EXISTS "Only designated master can revoke master role" ON public.user_roles;
DROP POLICY IF EXISTS "Site managers can update to foreman and reader" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update limited roles" ON public.user_roles;
DROP POLICY IF EXISTS "Masters can update any role except master" ON public.user_roles;
DROP POLICY IF EXISTS "Only designated master can update master role" ON public.user_roles;

-- Políticas de visualización (SELECT)
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Org admins or masters can view organization roles"
ON public.user_roles
FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
);

-- Políticas de INSERCIÓN (INSERT)
CREATE POLICY "Site managers can assign foreman and reader"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'site_manager'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role)
);

CREATE POLICY "Admins can assign limited roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role)
);

CREATE POLICY "Masters can assign any role except master"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
  AND role != 'master'::app_role
);

CREATE POLICY "Only designated master can assign master role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND is_designated_master()
  AND role = 'master'::app_role
);

-- Políticas de ELIMINACIÓN (DELETE)
CREATE POLICY "Site managers can revoke foreman and reader"
ON public.user_roles
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'site_manager'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role)
);

CREATE POLICY "Admins can revoke limited roles"
ON public.user_roles
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role)
);

CREATE POLICY "Masters can revoke any role except master"
ON public.user_roles
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
  AND role != 'master'::app_role
);

CREATE POLICY "Only designated master can revoke master role"
ON public.user_roles
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND is_designated_master()
  AND role = 'master'::app_role
);

-- Políticas de ACTUALIZACIÓN (UPDATE)
CREATE POLICY "Site managers can update to foreman and reader"
ON public.user_roles
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'site_manager'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role)
)
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'site_manager'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role)
);

CREATE POLICY "Admins can update limited roles"
ON public.user_roles
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role)
)
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role)
);

CREATE POLICY "Masters can update any role except master"
ON public.user_roles
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
  AND role != 'master'::app_role
)
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
  AND role != 'master'::app_role
);

CREATE POLICY "Only designated master can update master role"
ON public.user_roles
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND is_designated_master()
  AND role = 'master'::app_role
)
WITH CHECK (
  organization_id = current_user_organization()
  AND is_designated_master()
  AND role = 'master'::app_role
);