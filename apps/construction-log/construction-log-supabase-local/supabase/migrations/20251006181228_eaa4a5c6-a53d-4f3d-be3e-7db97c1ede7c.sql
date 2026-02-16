-- Fast path to fetch accessible work reports with proper filters
CREATE OR REPLACE FUNCTION public.get_accessible_work_reports(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS SETOF public.work_reports
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wr.*
  FROM public.work_reports wr
  WHERE wr.created_by = auth.uid()
     OR (wr.work_id IS NOT NULL AND has_work_access(auth.uid(), wr.work_id))
  ORDER BY wr.date DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
$$;