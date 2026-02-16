-- Allow supabase_auth_admin (auth backend) to manage profiles without RLS issues
CREATE POLICY "Auth admin can manage profiles"
ON public.profiles
AS PERMISSIVE
FOR ALL
TO supabase_auth_admin
USING (true)
WITH CHECK (true);