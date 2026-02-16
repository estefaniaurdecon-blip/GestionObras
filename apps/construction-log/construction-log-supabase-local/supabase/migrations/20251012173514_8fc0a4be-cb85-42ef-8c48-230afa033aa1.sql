-- Eliminar todas las políticas SELECT existentes en work_reports
DROP POLICY IF EXISTS "Users can view reports with role-based filters" ON public.work_reports;
DROP POLICY IF EXISTS "Users can view reports in org or assigned works" ON public.work_reports;

-- Crear nueva política que permite a site_managers ver solo partes completados
CREATE POLICY "Users can view reports with role filters"
ON public.work_reports
FOR SELECT
TO authenticated
USING (
  (
    -- Los creadores siempre pueden ver sus propios partes
    created_by = auth.uid()
  ) OR (
    -- Masters y Admins pueden ver todos los partes de su organización
    organization_id = current_user_organization() AND 
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
  ) OR (
    -- Site Managers solo pueden ver partes completados de su organización
    organization_id = current_user_organization() AND 
    has_role(auth.uid(), 'site_manager'::app_role) AND
    status = 'completed'
  ) OR (
    -- Usuarios asignados a la obra pueden ver los partes de esa obra
    (work_id IS NOT NULL) AND 
    is_assigned_to_work(auth.uid(), work_id)
  )
);

-- Actualizar la función de notificaciones para que solo notifique a site_managers 
-- cuando el parte esté completado
CREATE OR REPLACE FUNCTION public.notify_work_report_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  creator_name TEXT;
  v_notification_count INT;
BEGIN
  -- Get creator name
  SELECT full_name INTO creator_name
  FROM public.profiles
  WHERE id = NEW.created_by;

  -- Insert notifications for recipients
  -- Solo notificar a site_managers si el parte está completado
  WITH recipients AS (
    SELECT DISTINCT ur.user_id AS recipient_id
    FROM public.user_roles ur
    JOIN public.work_assignments wa ON wa.user_id = ur.user_id
    WHERE ur.role = 'site_manager'
      AND wa.work_id = NEW.work_id
      AND NEW.work_id IS NOT NULL
      AND NEW.status = 'completed'  -- Solo notificar si está completado
    
    UNION
    
    -- Los admins reciben notificaciones de todos los partes
    SELECT DISTINCT ur.user_id AS recipient_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
  )
  INSERT INTO public.notifications (user_id, type, title, message, related_id, organization_id)
  SELECT DISTINCT ON (recipient_id)
         recipient_id,
         'work_report_created',
         'Nuevo parte de trabajo',
         creator_name || ' ha creado un nuevo parte de trabajo para ' || NEW.work_name,
         NEW.id,
         NEW.organization_id
  FROM recipients
  WHERE recipient_id IS NOT NULL
    AND recipient_id <> NEW.created_by;

  GET DIAGNOSTICS v_notification_count = ROW_COUNT;
  RAISE NOTICE 'Created % notifications for work report %', v_notification_count, NEW.id;

  RETURN NEW;
END;
$function$;