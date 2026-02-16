-- Get assignable foremen for a site manager within their organization
create or replace function public.get_assignable_users_for_site_manager(org_id uuid)
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
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
    and not exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = p.id
        and ur2.role in ('admin'::app_role, 'site_manager'::app_role)
        and (ur2.organization_id = org_id or ur2.organization_id is null)
    )
  order by p.full_name nulls last
$$;