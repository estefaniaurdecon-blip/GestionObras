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

-- Eliminar políticas antiguas de asignación de roles
DROP POLICY IF EXISTS "Org admins or masters can assign roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can revoke roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can update roles" ON public.user_roles;

-- Política para site_managers: solo pueden asignar foreman y reader
CREATE POLICY "Site managers can assign foreman and reader"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'site_manager'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role)
);

-- Política para admins: pueden asignar foreman, reader y site_manager
CREATE POLICY "Admins can assign limited roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('foreman'::app_role, 'reader'::app_role, 'site_manager'::app_role)
);

-- Política para masters: pueden asignar cualquier rol excepto master
CREATE POLICY "Masters can assign any role except master"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'master'::app_role)
  AND role != 'master'::app_role
);

-- Política especial: solo el master designado puede asignar el rol master
CREATE POLICY "Only designated master can assign master role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND is_designated_master()
  AND role = 'master'::app_role
);

-- Políticas de eliminación de roles
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

-- Políticas de actualización de roles (misma lógica)
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