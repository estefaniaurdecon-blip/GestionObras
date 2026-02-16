-- Create notifications table for system notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('work_report_created', 'work_report_approved', 'work_report_rejected', 'new_message', 'new_comment')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id UUID, -- ID del parte de trabajo o mensaje relacionado
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create messages table for direct messaging
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_report_id UUID REFERENCES public.work_reports(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create work_report_comments table for comments on work reports
CREATE TABLE public.work_report_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_report_id UUID NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create push_subscriptions table for web push notifications
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Messages policies
CREATE POLICY "Users can view their messages"
ON public.messages FOR SELECT
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT
WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update their received messages"
ON public.messages FOR UPDATE
USING (auth.uid() = to_user_id);

-- Comments policies
CREATE POLICY "Users can view comments on their assigned work reports"
ON public.work_report_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.work_reports
    WHERE id = work_report_id
    AND (
      auth.uid() = created_by 
      OR public.has_role(auth.uid(), 'admin')
      OR (work_id IS NOT NULL AND public.has_work_access(auth.uid(), work_id))
    )
  )
);

CREATE POLICY "Users can create comments on accessible work reports"
ON public.work_report_comments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.work_reports
    WHERE id = work_report_id
    AND (
      auth.uid() = created_by 
      OR public.has_role(auth.uid(), 'admin')
      OR (work_id IS NOT NULL AND public.has_work_access(auth.uid(), work_id))
    )
  )
);

-- Push subscriptions policies
CREATE POLICY "Users can manage their own push subscriptions"
ON public.push_subscriptions FOR ALL
USING (auth.uid() = user_id);

-- Enable realtime for notifications and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_report_comments;

-- Create indexes for better performance
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_messages_from_user ON public.messages(from_user_id);
CREATE INDEX idx_messages_to_user ON public.messages(to_user_id);
CREATE INDEX idx_messages_work_report ON public.messages(work_report_id);
CREATE INDEX idx_comments_work_report ON public.work_report_comments(work_report_id);

-- Create function to automatically create notifications when work reports are created
CREATE OR REPLACE FUNCTION public.notify_work_report_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  site_manager_id UUID;
  creator_name TEXT;
BEGIN
  -- Get creator name
  SELECT full_name INTO creator_name
  FROM public.profiles
  WHERE id = NEW.created_by;

  -- Notify all site managers assigned to this work
  FOR site_manager_id IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.work_assignments wa ON wa.user_id = ur.user_id
    WHERE ur.role = 'site_manager'
    AND wa.work_id = NEW.work_id
    AND ur.user_id != NEW.created_by
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      site_manager_id,
      'work_report_created',
      'Nuevo parte de trabajo',
      creator_name || ' ha creado un nuevo parte de trabajo para ' || NEW.work_name,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger for work report creation
CREATE TRIGGER on_work_report_created
AFTER INSERT ON public.work_reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_work_report_created();

-- Create function to notify when work reports are approved/rejected
CREATE OR REPLACE FUNCTION public.notify_work_report_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approver_name TEXT;
BEGIN
  -- Only notify if approval status changed
  IF OLD.approved IS DISTINCT FROM NEW.approved AND NEW.approved_by IS NOT NULL THEN
    -- Get approver name
    SELECT full_name INTO approver_name
    FROM public.profiles
    WHERE id = NEW.approved_by;

    -- Notify the creator
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.created_by,
      CASE WHEN NEW.approved THEN 'work_report_approved' ELSE 'work_report_rejected' END,
      CASE WHEN NEW.approved THEN 'Parte aprobado' ELSE 'Parte rechazado' END,
      approver_name || CASE WHEN NEW.approved 
        THEN ' ha aprobado tu parte de trabajo de ' || NEW.work_name
        ELSE ' ha rechazado tu parte de trabajo de ' || NEW.work_name
      END,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for work report approval
CREATE TRIGGER on_work_report_status_change
AFTER UPDATE ON public.work_reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_work_report_status_change();