-- Fix infinite recursion in profiles policies
-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins and masters can view all profiles in organization" ON public.profiles;

-- Create a helper function to check if user can view a profile (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- User can view their own profile
  SELECT _profile_id = auth.uid()
  OR
  -- Or if user is admin/master in same organization
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur1
    JOIN public.profiles p1 ON p1.id = ur1.user_id
    JOIN public.profiles p2 ON p2.id = _profile_id
    WHERE ur1.user_id = auth.uid()
    AND ur1.role IN ('master', 'admin')
    AND p1.organization_id = p2.organization_id
  );
$$;

-- Create new non-recursive policies using the helper function
CREATE POLICY "Users can view accessible profiles"
ON public.profiles
FOR SELECT
USING (can_view_profile(id));

-- Fix organizations policy to use helper function
DROP POLICY IF EXISTS "Master and admin can view organization" ON public.organizations;

CREATE POLICY "Admins and masters can view organization"
ON public.organizations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('master', 'admin')
    AND ur.organization_id = organizations.id
  )
);

-- Fix company_portfolio policy
DROP POLICY IF EXISTS "Only admins, masters and site managers can view portfolio" ON public.company_portfolio;

CREATE POLICY "Authorized roles can view portfolio"
ON public.company_portfolio
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('master', 'admin', 'site_manager')
    AND ur.organization_id = company_portfolio.organization_id
  )
);

-- Fix works policy
DROP POLICY IF EXISTS "Users can view assigned works only" ON public.works;

CREATE POLICY "Users can view authorized works"
ON public.works
FOR SELECT
USING (
  -- Masters and admins can see all works in their organization
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('master', 'admin')
    AND ur.organization_id = works.organization_id
  )
  OR
  -- Site managers can see all works in their organization
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'site_manager'
    AND ur.organization_id = works.organization_id
  )
  OR
  -- Other users can only see works they are assigned to
  EXISTS (
    SELECT 1 FROM public.work_assignments
    WHERE user_id = auth.uid()
    AND work_id = works.id
  )
);

-- Fix saved_economic_reports policy
DROP POLICY IF EXISTS "Users can view own saved reports if still assigned" ON public.saved_economic_reports;

CREATE POLICY "Users can view accessible saved reports"
ON public.saved_economic_reports
FOR SELECT
USING (
  saved_by = auth.uid()
  OR
  -- Admins and masters can view all reports in their organization
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.work_reports wr ON wr.id = saved_economic_reports.work_report_id
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('master', 'admin')
    AND ur.organization_id = wr.organization_id
  )
);