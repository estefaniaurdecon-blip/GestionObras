-- Function: get_messageable_users
CREATE OR REPLACE FUNCTION public.get_messageable_users()
RETURNS TABLE (
  id uuid,
  full_name text,
  roles public.app_role[],
  approved boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         COALESCE(p.full_name, '') AS full_name,
         ARRAY_AGG(ur.role ORDER BY ur.role) AS roles,
         COALESCE(p.approved, false) AS approved
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE COALESCE(p.approved, false) = true
    AND ur.role IN ('admin','site_manager','foreman')
  GROUP BY p.id, p.full_name, p.approved;
$$;

-- Ensure function is executable by authenticated users
REVOKE ALL ON FUNCTION public.get_messageable_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_messageable_users() TO authenticated;