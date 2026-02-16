-- Función para obtener un admin de la organización del usuario actual
CREATE OR REPLACE FUNCTION public.get_organization_admin()
RETURNS TABLE (
  user_id uuid,
  full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ur.user_id, p.full_name
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
    AND ur.organization_id = current_user_organization()
    AND p.approved = true
  LIMIT 1;
$$;