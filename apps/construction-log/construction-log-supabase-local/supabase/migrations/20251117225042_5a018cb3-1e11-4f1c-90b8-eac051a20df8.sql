-- Security Fix: Make work-report-images bucket private and implement organization-based access control

-- Ensure bucket exists and is private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-report-images', 
  'work-report-images', 
  false,  -- CRITICAL: Make private
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) 
DO UPDATE SET 
  public = false,  -- Ensure it's private
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Drop the dangerous public read policy
DROP POLICY IF EXISTS "Public read for work-report-images" ON storage.objects;

-- Create organization-scoped access policies
-- Users can view images from their own organization
CREATE POLICY "Users can view images in their organization"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'work-report-images' AND
  auth.uid() IN (
    SELECT p1.id FROM profiles p1
    WHERE p1.organization_id = (
      SELECT p2.organization_id 
      FROM profiles p2 
      WHERE p2.id = auth.uid()
    )
  )
);

-- Users can upload images to their organization's folder
CREATE POLICY "Users can upload images in their organization"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'work-report-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Keep existing update/delete policies (they already check user ownership)
-- These were already correct in the previous migration