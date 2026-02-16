-- Performance indexes to prevent statement timeouts when filtering by creator or assigned works
-- Safe to run multiple times
CREATE INDEX IF NOT EXISTS idx_work_reports_created_by_date ON public.work_reports (created_by, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_work_id_date ON public.work_reports (work_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_id_work_id ON public.work_assignments (user_id, work_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles (user_id, role);

-- Optional: help EXISTS checks inside RLS has_work_access and role checks
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id_user_id ON public.work_assignments (work_id, user_id);
