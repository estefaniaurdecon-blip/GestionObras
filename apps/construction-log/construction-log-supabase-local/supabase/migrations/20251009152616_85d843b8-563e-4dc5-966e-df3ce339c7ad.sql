-- Revert to notify only site managers assigned to the specific work
CREATE OR REPLACE FUNCTION public.notify_work_report_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  creator_name TEXT;
BEGIN
  -- Get creator name
  SELECT full_name INTO creator_name
  FROM public.profiles
  WHERE id = NEW.created_by;

  -- Insert notifications for recipients (assigned site managers for the work + all admins), avoiding duplicates and excluding creator
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  SELECT DISTINCT recipient_id,
         'work_report_created',
         'Nuevo parte de trabajo',
         creator_name || ' ha creado un nuevo parte de trabajo para ' || NEW.work_name,
         NEW.id
  FROM (
    -- Site managers assigned to this work
    SELECT ur.user_id AS recipient_id
    FROM public.user_roles ur
    JOIN public.work_assignments wa ON wa.user_id = ur.user_id
    WHERE ur.role = 'site_manager'
      AND wa.work_id = NEW.work_id
      AND NEW.work_id IS NOT NULL

    UNION

    -- All admins
    SELECT ur.user_id AS recipient_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
  ) r
  WHERE r.recipient_id IS NOT NULL
    AND r.recipient_id <> NEW.created_by;

  RETURN NEW;
END;
$function$;