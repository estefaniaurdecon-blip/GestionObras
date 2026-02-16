-- Add approved field to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false;

-- Add unique constraint to auth.users email (this is already handled by Supabase)
-- But we'll add a check in the application level

-- Update existing users to be approved
UPDATE public.profiles SET approved = true WHERE approved = false;

-- Modify handle_new_user function to not assign role by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Crear perfil sin aprobar
  INSERT INTO public.profiles (id, full_name, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    false
  );
  
  -- Crear configuración de empresa vacía
  INSERT INTO public.company_settings (user_id)
  VALUES (NEW.id);
  
  -- Notificar a todos los administradores
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  SELECT ur.user_id, 'new_user_pending', 'Nuevo usuario pendiente de aprobación', 
         COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || ' se ha registrado y espera aprobación',
         NEW.id
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
  
  RETURN NEW;
END;
$function$;

-- Create function to delete user and all related data
CREATE OR REPLACE FUNCTION public.delete_user_and_data(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
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
  
  -- Delete work reports (only if user is creator, not if they just have access)
  DELETE FROM public.work_reports WHERE created_by = user_id_to_delete;
  
  -- Delete company settings
  DELETE FROM public.company_settings WHERE user_id = user_id_to_delete;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = user_id_to_delete;
  
  -- Delete from auth.users (this will cascade delete due to foreign keys)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$function$;

-- Update RLS policies for profiles to include approval check
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Site managers can only see approved users assigned to works they manage
DROP POLICY IF EXISTS "Site managers can view assigned users" ON public.profiles;
CREATE POLICY "Site managers can view assigned users" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'site_manager') 
  AND approved = true
  AND EXISTS (
    SELECT 1 FROM public.work_assignments wa1
    INNER JOIN public.work_assignments wa2 ON wa1.work_id = wa2.work_id
    WHERE wa1.user_id = auth.uid() 
    AND wa2.user_id = profiles.id
  )
);

-- Admins can update profiles
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- Update work_reports policies to check assignment date
DROP POLICY IF EXISTS "Users can view assigned work reports" ON public.work_reports;
CREATE POLICY "Users can view assigned work reports" 
ON public.work_reports 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') 
  OR (auth.uid() = created_by)
  OR (
    (work_id IS NOT NULL) 
    AND has_work_access(auth.uid(), work_id)
    AND created_at >= (
      SELECT created_at 
      FROM public.work_assignments 
      WHERE user_id = auth.uid() 
      AND work_id = work_reports.work_id 
      LIMIT 1
    )
  )
);

-- Add policy for admins to delete users
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'));