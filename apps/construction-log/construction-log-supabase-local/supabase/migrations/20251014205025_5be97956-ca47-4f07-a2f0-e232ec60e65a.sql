-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their shared files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

-- Policy for viewing files in shared-files bucket
CREATE POLICY "Users can view their shared files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'shared-files' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR
    EXISTS (
      SELECT 1 FROM public.shared_files sf
      WHERE sf.file_path = storage.objects.name
      AND sf.to_user_id = auth.uid()
    )
  )
);

-- Policy for uploading files to shared-files bucket
CREATE POLICY "Users can upload to their own folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'shared-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for deleting files from shared-files bucket
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'shared-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);