-- Performance indexes to fix statement timeout when listing work reports with RLS filters
-- Speeds up ORDER BY date DESC and access checks on assignments/roles

-- Work reports: ordering and common filters
CREATE INDEX IF NOT EXISTS idx_work_reports_date_desc ON public.work_reports (date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_created_by_date ON public.work_reports (created_by, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_work_id_date ON public.work_reports (work_id, date DESC);

-- Works: lookup by number in RLS policy
CREATE INDEX IF NOT EXISTS idx_works_number ON public.works (number);

-- Work assignments: used heavily in has_work_access()
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_id ON public.work_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON public.work_assignments (work_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_id_work_id ON public.work_assignments (user_id, work_id);

-- User roles: used by has_role()
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles (user_id, role);
