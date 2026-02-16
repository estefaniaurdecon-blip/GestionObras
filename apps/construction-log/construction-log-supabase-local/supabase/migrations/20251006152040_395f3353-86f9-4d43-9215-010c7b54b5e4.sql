-- Performance and RLS acceleration indexes + backfill work_id for legacy rows

-- Work reports
CREATE INDEX IF NOT EXISTS idx_work_reports_date_desc ON public.work_reports (date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_created_by ON public.work_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_work_reports_created_by_date ON public.work_reports (created_by, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_work_id ON public.work_reports (work_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_work_id_date ON public.work_reports (work_id, date DESC);

-- Works: lookup by number used in RLS
CREATE INDEX IF NOT EXISTS idx_works_number ON public.works (number);

-- Work assignments: used by has_work_access()
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_id ON public.work_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON public.work_assignments (work_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_id_work_id ON public.work_assignments (user_id, work_id);

-- User roles: used by has_role()
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles (user_id, role);

-- Backfill work_id from works.number to avoid expensive RLS path that matches by work_number
UPDATE public.work_reports wr
SET work_id = w.id
FROM public.works w
WHERE wr.work_id IS NULL AND w.number = wr.work_number;