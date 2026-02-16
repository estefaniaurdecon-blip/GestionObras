-- Enable RLS on target tables
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_economic_reports ENABLE ROW LEVEL SECURITY;

-- COMPANY SETTINGS POLICIES
DROP POLICY IF EXISTS "Org users can view company settings" ON public.company_settings;
CREATE POLICY "Org users can view company settings"
ON public.company_settings
FOR SELECT TO authenticated
USING (
  organization_id = current_user_organization()
);

DROP POLICY IF EXISTS "Org admins can manage company settings" ON public.company_settings;
CREATE POLICY "Org admins can manage company settings"
ON public.company_settings
FOR ALL TO authenticated
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'site_manager') OR has_role(auth.uid(),'master'))
)
WITH CHECK (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'site_manager') OR has_role(auth.uid(),'master'))
);

-- WORK REPORT COMMENTS POLICIES
DROP POLICY IF EXISTS "Users can view comments of accessible reports" ON public.work_report_comments;
CREATE POLICY "Users can view comments of accessible reports"
ON public.work_report_comments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = work_report_comments.work_report_id
      AND (
        wr.created_by = auth.uid()
        OR ((wr.organization_id = current_user_organization()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'master') OR (has_role(auth.uid(),'site_manager') AND wr.status = 'completed')))
        OR ((wr.work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), wr.work_id))
      )
  )
);

DROP POLICY IF EXISTS "Users can create comments on accessible reports" ON public.work_report_comments;
CREATE POLICY "Users can create comments on accessible reports"
ON public.work_report_comments
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = work_report_comments.work_report_id
      AND (
        wr.created_by = auth.uid()
        OR ((wr.organization_id = current_user_organization()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'master') OR (has_role(auth.uid(),'site_manager') AND wr.status = 'completed')))
        OR ((wr.work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), wr.work_id))
      )
  )
);

DROP POLICY IF EXISTS "Users can update their own comments" ON public.work_report_comments;
CREATE POLICY "Users can update their own comments"
ON public.work_report_comments
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins/managers can delete comments in org" ON public.work_report_comments;
CREATE POLICY "Admins/managers can delete comments in org"
ON public.work_report_comments
FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'site_manager') OR has_role(auth.uid(),'master'))
  AND EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = work_report_comments.work_report_id
      AND wr.organization_id = current_user_organization()
  )
);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.work_report_comments;
CREATE POLICY "Users can delete their own comments"
ON public.work_report_comments
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- SAVED ECONOMIC REPORTS POLICIES
DROP POLICY IF EXISTS "Users can view their saved reports or org admins" ON public.saved_economic_reports;
CREATE POLICY "Users can view their saved reports or org admins"
ON public.saved_economic_reports
FOR SELECT TO authenticated
USING (
  saved_by = auth.uid()
  OR (
    organization_id = current_user_organization()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'site_manager') OR has_role(auth.uid(),'master'))
  )
);

DROP POLICY IF EXISTS "Users can insert their saved reports" ON public.saved_economic_reports;
CREATE POLICY "Users can insert their saved reports"
ON public.saved_economic_reports
FOR INSERT TO authenticated
WITH CHECK (
  saved_by = auth.uid()
  AND (organization_id IS NULL OR organization_id = current_user_organization())
);

DROP POLICY IF EXISTS "Users can update their saved reports" ON public.saved_economic_reports;
CREATE POLICY "Users can update their saved reports"
ON public.saved_economic_reports
FOR UPDATE TO authenticated
USING (saved_by = auth.uid())
WITH CHECK (saved_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete their saved reports" ON public.saved_economic_reports;
CREATE POLICY "Users can delete their saved reports"
ON public.saved_economic_reports
FOR DELETE TO authenticated
USING (saved_by = auth.uid());
