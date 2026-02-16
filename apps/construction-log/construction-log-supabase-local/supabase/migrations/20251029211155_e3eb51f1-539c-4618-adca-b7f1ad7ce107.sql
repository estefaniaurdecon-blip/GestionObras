-- Corregir notificaciones para que solo lleguen a usuarios asignados a la misma obra
CREATE OR REPLACE FUNCTION public.notify_work_report_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_name TEXT;
  v_notification_count INT;
BEGIN
  -- Get creator name
  SELECT full_name INTO creator_name
  FROM public.profiles
  WHERE id = NEW.created_by;

  -- Insert notifications ONLY for users assigned to the same work
  WITH recipients AS (
    SELECT DISTINCT ur.user_id AS recipient_id
    FROM public.user_roles ur
    JOIN public.work_assignments wa ON wa.user_id = ur.user_id
    WHERE wa.work_id = NEW.work_id
      AND NEW.work_id IS NOT NULL
      AND NEW.status = 'completed'
      AND ur.organization_id = NEW.organization_id
      AND ur.role IN ('site_manager', 'admin', 'master', 'foreman')
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
$$;

-- Corregir también la función de notificación de completado
CREATE OR REPLACE FUNCTION public.notify_work_report_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_name TEXT;
  v_notification_count INT;
BEGIN
  -- Solo notificar si el estado cambió a 'completed' y antes no lo estaba
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Get creator name
    SELECT full_name INTO creator_name
    FROM public.profiles
    WHERE id = NEW.created_by;

    -- Notificar SOLO a usuarios asignados a la misma obra
    WITH recipients AS (
      SELECT DISTINCT ur.user_id AS recipient_id
      FROM public.user_roles ur
      JOIN public.work_assignments wa ON wa.user_id = ur.user_id
      WHERE wa.work_id = NEW.work_id
        AND NEW.work_id IS NOT NULL
        AND ur.organization_id = NEW.organization_id
        AND ur.role IN ('site_manager', 'admin', 'master', 'foreman')
    )
    INSERT INTO public.notifications (user_id, type, title, message, related_id, organization_id)
    SELECT DISTINCT ON (recipient_id)
           recipient_id,
           'work_report_created',
           'Parte de trabajo completado',
           creator_name || ' ha completado el parte de trabajo para ' || NEW.work_name,
           NEW.id,
           NEW.organization_id
    FROM recipients
    WHERE recipient_id IS NOT NULL
      AND recipient_id <> NEW.created_by;

    GET DIAGNOSTICS v_notification_count = ROW_COUNT;
    RAISE NOTICE 'Created % completion notifications for work report %', v_notification_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;