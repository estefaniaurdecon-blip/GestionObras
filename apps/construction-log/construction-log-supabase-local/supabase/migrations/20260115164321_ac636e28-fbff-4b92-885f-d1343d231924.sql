-- Remove overly permissive policies that bypass all security
DROP POLICY IF EXISTS "Auth admin can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;

-- Keep existing secure policies but ensure they are properly restrictive
-- The "can_view_profile" function already provides proper organization-based access control
-- The "Admins can manage organization profiles" policy is already properly scoped