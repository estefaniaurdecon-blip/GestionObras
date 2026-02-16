-- Actualizar función para eliminar usuario y todos sus datos
CREATE OR REPLACE FUNCTION public.delete_user_and_data(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Handle work_reports references
  UPDATE public.work_reports 
  SET approved_by = NULL 
  WHERE approved_by = user_id_to_delete;
  
  UPDATE public.work_reports 
  SET created_by = NULL,
      last_edited_by = NULL
  WHERE created_by = user_id_to_delete OR last_edited_by = user_id_to_delete;
  
  -- Handle works references
  UPDATE public.works
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle work_assignments created_by
  UPDATE public.work_assignments
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle calendar_tasks references
  UPDATE public.calendar_tasks
  SET created_by = NULL,
      assigned_to = NULL,
      completed_by = NULL
  WHERE created_by = user_id_to_delete 
     OR assigned_to = user_id_to_delete 
     OR completed_by = user_id_to_delete;
  
  -- Handle work_rental_machinery references
  UPDATE public.work_rental_machinery
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle work_rental_machinery_assignments references
  UPDATE public.work_rental_machinery_assignments
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle work_report_images references
  UPDATE public.work_report_images
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle company_portfolio references
  UPDATE public.company_portfolio
  SET created_by = NULL,
      updated_by = NULL
  WHERE created_by = user_id_to_delete OR updated_by = user_id_to_delete;
  
  -- Handle company_types references
  UPDATE public.company_types
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle custom_holidays references
  UPDATE public.custom_holidays
  SET created_by = NULL
  WHERE created_by = user_id_to_delete;
  
  -- Handle app_versions references
  UPDATE public.app_versions
  SET published_by = NULL
  WHERE published_by = user_id_to_delete;
  
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
  
  -- Delete push subscriptions
  DELETE FROM public.push_subscriptions WHERE user_id = user_id_to_delete;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = user_id_to_delete;
  
  -- Finally, delete from auth.users (this should cascade remaining references)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$;