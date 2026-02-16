-- =====================================================
-- MULTI-TENANCY IMPLEMENTATION - PART 1: DROP EXISTING POLICIES
-- =====================================================

-- Drop all existing policies to rebuild them
DROP POLICY IF EXISTS "Admins can view org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Site managers can view org assignable users" ON public.profiles;
DROP POLICY IF EXISTS "Site managers can view org assigned users" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "Admins can view org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Site managers can view org user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete org roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins and site managers can insert org works" ON public.works;
DROP POLICY IF EXISTS "Admins and site managers can update org works" ON public.works;
DROP POLICY IF EXISTS "Users can view org assigned works" ON public.works;

DROP POLICY IF EXISTS "Admins can view org work reports" ON public.work_reports;
DROP POLICY IF EXISTS "Users can view org work reports" ON public.work_reports;
DROP POLICY IF EXISTS "Users can insert org reports" ON public.work_reports;
DROP POLICY IF EXISTS "Users can update org reports" ON public.work_reports;
DROP POLICY IF EXISTS "Users can delete org reports" ON public.work_reports;

DROP POLICY IF EXISTS "Users can view org messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send org messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update org messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete org messages" ON public.messages;

DROP POLICY IF EXISTS "Users can view org shared files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can share org files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can update org files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can delete org files" ON public.shared_files;

DROP POLICY IF EXISTS "Users can view org notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update org notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete org notifications" ON public.notifications;
DROP POLICY IF EXISTS "Only system functions can create notifications" ON public.notifications;

DROP POLICY IF EXISTS "Admins can view org saved reports" ON public.saved_economic_reports;
DROP POLICY IF EXISTS "Site managers can view org saved reports" ON public.saved_economic_reports;
DROP POLICY IF EXISTS "Managers can insert org saved reports" ON public.saved_economic_reports;
DROP POLICY IF EXISTS "Admins can delete org saved reports" ON public.saved_economic_reports;

DROP POLICY IF EXISTS "Users can view org settings" ON public.company_settings;
DROP POLICY IF EXISTS "Users can insert org settings" ON public.company_settings;
DROP POLICY IF EXISTS "Users can update org settings" ON public.company_settings;

DROP POLICY IF EXISTS "Admins can manage org assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Users can view org assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Managers can assign org users" ON public.work_assignments;
DROP POLICY IF EXISTS "Managers can remove org assignments" ON public.work_assignments;

DROP POLICY IF EXISTS "Users can view org comments" ON public.work_report_comments;
DROP POLICY IF EXISTS "Users can create org comments" ON public.work_report_comments;