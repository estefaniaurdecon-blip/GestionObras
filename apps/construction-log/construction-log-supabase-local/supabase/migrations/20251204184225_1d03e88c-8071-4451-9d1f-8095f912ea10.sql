-- Drop all audit-related triggers first
DROP TRIGGER IF EXISTS audit_user_delete ON public.profiles;
DROP TRIGGER IF EXISTS audit_work_report_approval ON public.work_reports;
DROP TRIGGER IF EXISTS audit_role_change ON public.user_roles;

-- Drop audit-related functions with CASCADE
DROP FUNCTION IF EXISTS public.audit_log_user_delete() CASCADE;
DROP FUNCTION IF EXISTS public.audit_log_work_report_approval() CASCADE;
DROP FUNCTION IF EXISTS public.audit_log_role_change() CASCADE;
DROP FUNCTION IF EXISTS public.create_audit_log(text, text, uuid, jsonb) CASCADE;

-- Drop the audit_logs table
DROP TABLE IF EXISTS public.audit_logs CASCADE;