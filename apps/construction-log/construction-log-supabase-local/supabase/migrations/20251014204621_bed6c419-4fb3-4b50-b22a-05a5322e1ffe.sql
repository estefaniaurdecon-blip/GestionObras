-- Create function to notify sender when file is downloaded
CREATE OR REPLACE FUNCTION public.notify_file_downloaded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_name TEXT;
BEGIN
  -- Only notify if downloaded status changed from false to true
  IF OLD.downloaded IS DISTINCT FROM NEW.downloaded AND NEW.downloaded = true THEN
    -- Get recipient name
    SELECT full_name INTO recipient_name
    FROM public.profiles
    WHERE id = NEW.to_user_id;

    -- Create notification for sender
    INSERT INTO public.notifications (user_id, type, title, message, related_id, organization_id)
    VALUES (
      NEW.from_user_id,
      'file_downloaded',
      'Archivo recibido',
      recipient_name || ' ha recibido el archivo: ' || NEW.file_name,
      NEW.id,
      NEW.organization_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for file downloads
DROP TRIGGER IF EXISTS on_file_downloaded ON shared_files;

CREATE TRIGGER on_file_downloaded
  AFTER UPDATE ON shared_files
  FOR EACH ROW
  EXECUTE FUNCTION notify_file_downloaded();