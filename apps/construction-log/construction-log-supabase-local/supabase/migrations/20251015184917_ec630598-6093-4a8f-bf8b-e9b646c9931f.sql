-- SECURITY FIX: Restrict work report visibility strictly to current organization

-- 1) Replace SELECT policy on work_reports to always enforce organization boundary
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'work_reports' 
      AND policyname = 'Users can view reports with role filters'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view reports with role filters" ON public.work_reports';
  END IF;
END $$;

CREATE POLICY "Users can view reports in their organization"
ON public.work_reports
FOR SELECT
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND status = 'completed')
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);

-- 2) Harden the helper function to respect organization boundary even though it runs as SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_accessible_work_reports(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS SETOF work_reports
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible_works AS (
    SELECT wa.work_id
    FROM public.work_assignments wa
    WHERE wa.user_id = auth.uid()
      AND (wa.organization_id IS NULL OR wa.organization_id = current_user_organization())
  )
  SELECT wr.*
  FROM public.work_reports wr
  WHERE wr.organization_id = current_user_organization()
    AND (
      wr.created_by = auth.uid()
      OR (wr.work_id IS NOT NULL AND wr.work_id IN (SELECT work_id FROM accessible_works))
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'master'::app_role)
      OR (has_role(auth.uid(), 'site_manager'::app_role) AND wr.status = 'completed')
    )
  ORDER BY wr.date DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
$$;