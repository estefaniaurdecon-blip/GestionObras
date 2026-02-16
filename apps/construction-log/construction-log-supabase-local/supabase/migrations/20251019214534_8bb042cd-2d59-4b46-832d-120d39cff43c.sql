-- Eliminar usuario tonymoratalla3@gmail.com y todos sus datos asociados
DO $$
DECLARE
  user_id_to_delete UUID := '588512f1-45b1-4d7b-a2f3-184b00a650e6';
BEGIN
  -- Actualizar referencias en work_reports
  UPDATE public.work_reports 
  SET approved_by = NULL 
  WHERE approved_by = user_id_to_delete;

  UPDATE public.work_reports 
  SET created_by = NULL 
  WHERE created_by = user_id_to_delete;

  -- Eliminar datos relacionados
  DELETE FROM public.user_roles WHERE user_id = user_id_to_delete;
  DELETE FROM public.work_assignments WHERE user_id = user_id_to_delete;
  DELETE FROM public.messages WHERE from_user_id = user_id_to_delete OR to_user_id = user_id_to_delete;
  DELETE FROM public.notifications WHERE user_id = user_id_to_delete;
  DELETE FROM public.shared_files WHERE from_user_id = user_id_to_delete OR to_user_id = user_id_to_delete;
  DELETE FROM public.work_report_comments WHERE user_id = user_id_to_delete;
  DELETE FROM public.saved_economic_reports WHERE saved_by = user_id_to_delete;
  DELETE FROM public.company_settings WHERE user_id = user_id_to_delete;
  DELETE FROM public.push_subscriptions WHERE user_id = user_id_to_delete;
  DELETE FROM public.work_reports WHERE created_by = user_id_to_delete;
  
  -- Eliminar perfil
  DELETE FROM public.profiles WHERE id = user_id_to_delete;
  
  -- Eliminar usuario de auth
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END $$;