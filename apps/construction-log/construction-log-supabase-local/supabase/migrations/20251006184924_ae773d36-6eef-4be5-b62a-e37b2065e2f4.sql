-- Optimize work report loading with proper indexes and a faster RPC

-- 1) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_work_reports_date ON public.work_reports (date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_created_by_date ON public.work_reports (created_by, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_work_id_date ON public.work_reports (work_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_work ON public.work_assignments (user_id, work_id);

-- 2) Faster RPC using indexed IN lookup instead of per-row function calls
CREATE OR REPLACE FUNCTION public.get_accessible_work_reports(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS SETOF work_reports
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH accessible_works AS (
    SELECT wa.work_id
    FROM public.work_assignments wa
    WHERE wa.user_id = auth.uid()
  )
  SELECT wr.*
  FROM public.work_reports wr
  WHERE wr.created_by = auth.uid()
     OR (wr.work_id IS NOT NULL AND wr.work_id IN (SELECT work_id FROM accessible_works))
  ORDER BY wr.date DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
$$;