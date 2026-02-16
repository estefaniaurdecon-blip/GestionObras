-- Fix critical security vulnerabilities
-- 1. Restrict profiles table to show only own profile or admin/master access
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can view organization profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Admins and masters can view all profiles in organization"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('master', 'admin')
    AND ur.user_id IN (
      SELECT id FROM public.profiles WHERE organization_id = profiles.organization_id
    )
  )
);

-- 2. Restrict organizations table to master and admin roles only
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;

CREATE POLICY "Master and admin can view organization"
ON public.organizations
FOR SELECT
USING (
  id IN (
    SELECT p.organization_id 
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid()
    AND ur.role IN ('master', 'admin')
  )
);

-- 3. Restrict company_portfolio to admins, site managers and masters only
DROP POLICY IF EXISTS "Users can view companies in their org" ON public.company_portfolio;
DROP POLICY IF EXISTS "Users can view company portfolio in their organization" ON public.company_portfolio;

CREATE POLICY "Only admins, masters and site managers can view portfolio"
ON public.company_portfolio
FOR SELECT
USING (
  organization_id IN (
    SELECT p.organization_id 
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid()
    AND ur.role IN ('master', 'admin', 'site_manager')
  )
);

-- 4. Restrict works table to show only assigned works for regular users
DROP POLICY IF EXISTS "Users can view works in their org only" ON public.works;

CREATE POLICY "Users can view assigned works only"
ON public.works
FOR SELECT
USING (
  -- Masters and admins can see all works in their organization
  (
    organization_id IN (
      SELECT p.organization_id 
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid()
      AND ur.role IN ('master', 'admin')
    )
  )
  OR
  -- Site managers can see all works
  (
    organization_id IN (
      SELECT p.organization_id 
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid()
      AND ur.role = 'site_manager'
    )
  )
  OR
  -- Other users can only see works they are assigned to
  (
    id IN (
      SELECT work_id FROM public.work_assignments
      WHERE user_id = auth.uid()
    )
  )
);

-- 5. Require authentication for app_versions
DROP POLICY IF EXISTS "Anyone can view published versions" ON public.app_versions;

CREATE POLICY "Authenticated users can view versions"
ON public.app_versions
FOR SELECT
USING (
  auth.uid() IS NOT NULL
);

-- 6. Update saved reports policy - check if user is still assigned to the work_report's work
DROP POLICY IF EXISTS "Users can view their saved reports or org admins" ON public.saved_economic_reports;

CREATE POLICY "Users can view own saved reports if still assigned"
ON public.saved_economic_reports
FOR SELECT
USING (
  saved_by = auth.uid()
  AND (
    -- User is still assigned to the work from the work_report
    EXISTS (
      SELECT 1 
      FROM public.work_reports wr
      JOIN public.work_assignments wa ON wa.work_id = wr.work_id
      WHERE wr.id = saved_economic_reports.work_report_id
      AND wa.user_id = auth.uid()
    )
    OR
    -- User is admin or master
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('master', 'admin')
    )
  )
);