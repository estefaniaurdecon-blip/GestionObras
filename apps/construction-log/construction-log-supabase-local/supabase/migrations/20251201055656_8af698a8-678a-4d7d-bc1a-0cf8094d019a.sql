-- Allow service_role to manage profiles for auth triggers without RLS errors
CREATE POLICY "Service role can manage profiles"
ON public.profiles
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);