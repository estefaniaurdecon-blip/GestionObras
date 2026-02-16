-- Grant execute permission on get_messageable_users to authenticated users
GRANT EXECUTE ON FUNCTION public.get_messageable_users() TO authenticated;

-- Also ensure the function can be called by any authenticated user
REVOKE ALL ON FUNCTION public.get_messageable_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_messageable_users() TO authenticated;