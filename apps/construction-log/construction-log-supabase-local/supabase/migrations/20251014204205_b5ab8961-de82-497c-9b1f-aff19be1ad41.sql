-- Create function to notify when a message is received
CREATE OR REPLACE FUNCTION public.notify_message_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name
  FROM public.profiles
  WHERE id = NEW.from_user_id;

  -- Create notification for recipient
  INSERT INTO public.notifications (user_id, type, title, message, related_id, organization_id)
  VALUES (
    NEW.to_user_id,
    'new_message',
    'Nuevo mensaje',
    sender_name || ' te ha enviado un mensaje',
    NEW.id,
    NEW.organization_id
  );

  RETURN NEW;
END;
$$;

-- Create trigger for messages
DROP TRIGGER IF EXISTS on_message_received ON messages;

CREATE TRIGGER on_message_received
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_message_received();