-- Update function to allow site managers to assign any user with foreman role
-- regardless of other roles they may have
DROP FUNCTION IF EXISTS public.get_assignable_users_for_site_manager(uuid);

CREATE OR REPLACE FUNCTION public.get_assignable_users_for_site_manager(org_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  select p.id, p.full_name
  from public.profiles p
  where p.organization_id = org_id
    and coalesce(p.approved, false) = true
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'foreman'::app_role
        and (ur.organization_id = org_id or ur.organization_id is null)
    )
  order by p.full_name nulls last
$$;