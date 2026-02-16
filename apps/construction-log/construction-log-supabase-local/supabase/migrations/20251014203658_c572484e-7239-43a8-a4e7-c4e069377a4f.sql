-- Enable RLS on shared_files table
ALTER TABLE shared_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert shared files to users in their organization
CREATE POLICY "Users can share files within organization"
ON shared_files
FOR INSERT
WITH CHECK (
  auth.uid() = from_user_id 
  AND organization_id = current_user_organization()
  AND same_organization(to_user_id)
);

-- Policy: Users can view files they sent
CREATE POLICY "Users can view sent files"
ON shared_files
FOR SELECT
USING (auth.uid() = from_user_id);

-- Policy: Users can view files they received
CREATE POLICY "Users can view received files"
ON shared_files
FOR SELECT
USING (auth.uid() = to_user_id);

-- Policy: Users can update files they received (mark as downloaded)
CREATE POLICY "Users can update received files"
ON shared_files
FOR UPDATE
USING (auth.uid() = to_user_id)
WITH CHECK (auth.uid() = to_user_id);

-- Policy: Users can delete files they sent
CREATE POLICY "Users can delete sent files"
ON shared_files
FOR DELETE
USING (auth.uid() = from_user_id);

-- Policy: Users can delete files they received
CREATE POLICY "Users can delete received files"
ON shared_files
FOR DELETE
USING (auth.uid() = to_user_id);