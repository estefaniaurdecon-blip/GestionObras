-- Create storage bucket for shared files (compatible with multiple storage schemas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'public'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('shared-files', 'shared-files', false)
    ON CONFLICT (id) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'is_public'
  ) THEN
    INSERT INTO storage.buckets (id, name, is_public)
    VALUES ('shared-files', 'shared-files', false)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO storage.buckets (id, name)
    VALUES ('shared-files', 'shared-files')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Create shared_files table to track file sharing
CREATE TABLE public.shared_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  work_report_id UUID REFERENCES public.work_reports(id) ON DELETE CASCADE,
  message TEXT,
  downloaded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT shared_files_from_user_fkey 
    FOREIGN KEY (from_user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE,
  CONSTRAINT shared_files_to_user_fkey 
    FOREIGN KEY (to_user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.shared_files ENABLE ROW LEVEL SECURITY;

-- Users can view files sent to them or sent by them
CREATE POLICY "Users can view their shared files"
ON public.shared_files
FOR SELECT
TO authenticated
USING (
  auth.uid() = from_user_id OR 
  auth.uid() = to_user_id
);

-- Users can insert files they're sending
CREATE POLICY "Users can share files"
ON public.shared_files
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = from_user_id);

-- Users can update files they received (mark as downloaded)
CREATE POLICY "Users can update received files"
ON public.shared_files
FOR UPDATE
TO authenticated
USING (auth.uid() = to_user_id);

-- Storage policies for shared-files bucket
CREATE POLICY "Users can upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shared-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view files shared with them"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shared-files' AND
  (
    -- Files in user's own folder
    auth.uid()::text = (storage.foldername(name))[1] OR
    -- Files shared with user
    EXISTS (
      SELECT 1 FROM public.shared_files
      WHERE file_path = name
      AND to_user_id = auth.uid()
    )
  )
);

-- Trigger to notify when file is shared
CREATE OR REPLACE FUNCTION public.notify_file_shared()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  sender_name TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name
  FROM public.profiles
  WHERE id = NEW.from_user_id;

  -- Create notification for recipient
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    NEW.to_user_id,
    'new_message',
    'Archivo compartido',
    sender_name || ' te ha enviado el archivo: ' || NEW.file_name,
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_file_shared
AFTER INSERT ON public.shared_files
FOR EACH ROW
EXECUTE FUNCTION public.notify_file_shared();

-- Index for better performance
CREATE INDEX idx_shared_files_to_user ON public.shared_files(to_user_id, created_at DESC);
CREATE INDEX idx_shared_files_from_user ON public.shared_files(from_user_id, created_at DESC);
