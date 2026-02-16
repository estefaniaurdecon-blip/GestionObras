-- Drop existing foreign keys and recreate them pointing to profiles
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_from_user_id_fkey,
  DROP CONSTRAINT IF EXISTS messages_to_user_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_from_user_id_fkey 
    FOREIGN KEY (from_user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_to_user_id_fkey 
    FOREIGN KEY (to_user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;

-- Do the same for notifications
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;

-- And for work_report_comments
ALTER TABLE public.work_report_comments
  DROP CONSTRAINT IF EXISTS work_report_comments_user_id_fkey;

ALTER TABLE public.work_report_comments
  ADD CONSTRAINT work_report_comments_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;

-- And for push_subscriptions
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;