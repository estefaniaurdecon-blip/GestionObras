-- Crear función para notificar cuando un parte pase a completado
CREATE OR REPLACE FUNCTION public.notify_work_report_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    -- Notificar a site_managers de la obra
    WITH recipients AS (
      SELECT DISTINCT ur.user_id AS recipient_id
      FROM public.user_roles ur
      JOIN public.work_assignments wa ON wa.user_id = ur.user_id
      WHERE ur.role = 'site_manager'
        AND wa.work_id = NEW.work_id
        AND NEW.work_id IS NOT NULL
    )
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    SELECT DISTINCT ON (recipient_id)
           recipient_id,
           'work_report_created',
           'Parte de trabajo completado',
           creator_name || ' ha completado el parte de trabajo para ' || NEW.work_name,
           NEW.id
    FROM recipients
    WHERE recipient_id IS NOT NULL
      AND recipient_id <> NEW.created_by;

    GET DIAGNOSTICS v_notification_count = ROW_COUNT;
    RAISE NOTICE 'Created % completion notifications for work report %', v_notification_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Crear trigger para detectar cambio de estado a completado
DROP TRIGGER IF EXISTS on_work_report_completed ON public.work_reports;
CREATE TRIGGER on_work_report_completed
  AFTER UPDATE ON public.work_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_work_report_completion();