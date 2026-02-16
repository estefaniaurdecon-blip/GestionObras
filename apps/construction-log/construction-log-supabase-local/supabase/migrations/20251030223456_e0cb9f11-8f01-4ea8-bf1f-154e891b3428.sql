-- Create function to notify admins of new pending users
CREATE OR REPLACE FUNCTION public.notify_admins_of_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Only notify if user is not approved (pending approval)
  IF NEW.approved = false THEN
    -- Get all admin and master users from the same organization
    FOR admin_record IN
      SELECT DISTINCT ur.user_id
      FROM user_roles ur
      INNER JOIN profiles p ON p.id = ur.user_id
      WHERE ur.role IN ('admin', 'master')
        AND (p.organization_id = NEW.organization_id OR NEW.organization_id IS NULL)
        AND ur.user_id != NEW.id
    LOOP
      -- Create notification for each admin
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        related_id,
        read,
        organization_id
      ) VALUES (
        admin_record.user_id,
        'new_user_pending',
        'Nuevo usuario pendiente',
        'Un nuevo usuario (' || COALESCE(NEW.full_name, NEW.email, 'Sin nombre') || ') está esperando aprobación',
        NEW.id,
        false,
        NEW.organization_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS on_new_user_pending ON public.profiles;

CREATE TRIGGER on_new_user_pending
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_of_new_user();