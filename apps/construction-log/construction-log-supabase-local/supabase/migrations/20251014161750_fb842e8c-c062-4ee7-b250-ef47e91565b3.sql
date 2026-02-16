-- Update delete_user_and_data function to handle all foreign key references
CREATE OR REPLACE FUNCTION public.delete_user_and_data(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- First, handle work_reports references
  -- Set approved_by to NULL for work reports approved by this user
  UPDATE public.work_reports 
  SET approved_by = NULL 
  WHERE approved_by = user_id_to_delete;
  
  -- Set created_by to NULL for work reports created by this user
  -- (or delete them if you prefer)
  UPDATE public.work_reports 
  SET created_by = NULL 
  WHERE created_by = user_id_to_delete;
  
  -- Delete user roles
  DELETE FROM public.user_roles WHERE user_id = user_id_to_delete;
  
  -- Delete work assignments
  DELETE FROM public.work_assignments WHERE user_id = user_id_to_delete;
  
  -- Delete notifications
  DELETE FROM public.notifications WHERE user_id = user_id_to_delete;
  
  -- Delete messages (sent and received)
  DELETE FROM public.messages WHERE from_user_id = user_id_to_delete OR to_user_id = user_id_to_delete;
  
  -- Delete shared files
  DELETE FROM public.shared_files WHERE from_user_id = user_id_to_delete OR to_user_id = user_id_to_delete;
  
  -- Delete work report comments
  DELETE FROM public.work_report_comments WHERE user_id = user_id_to_delete;
  
  -- Delete company settings
  DELETE FROM public.company_settings WHERE user_id = user_id_to_delete;
  
  -- Delete saved economic reports
  DELETE FROM public.saved_economic_reports WHERE saved_by = user_id_to_delete;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = user_id_to_delete;
  
  -- Finally, delete from auth.users (this should cascade remaining references)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$;