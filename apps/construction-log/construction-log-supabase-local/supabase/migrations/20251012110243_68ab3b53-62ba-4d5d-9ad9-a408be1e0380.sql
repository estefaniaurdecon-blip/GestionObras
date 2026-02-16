-- Add logo column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS logo TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN public.organizations.logo IS 'URL or base64 encoded company logo that will be used across all work reports';