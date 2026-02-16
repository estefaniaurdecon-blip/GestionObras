-- Fix search_path vulnerability in SECURITY DEFINER functions
-- Add SET search_path = public to functions missing this protection

ALTER FUNCTION public.can_view_profile(_profile_id uuid) 
SET search_path = public;

ALTER FUNCTION public.notify_admins_of_new_user() 
SET search_path = public;

ALTER FUNCTION public.notify_work_report_completion() 
SET search_path = public;

ALTER FUNCTION public.notify_work_assignment() 
SET search_path = public;

ALTER FUNCTION public.has_work_access(_user_id uuid, _work_id uuid) 
SET search_path = public;