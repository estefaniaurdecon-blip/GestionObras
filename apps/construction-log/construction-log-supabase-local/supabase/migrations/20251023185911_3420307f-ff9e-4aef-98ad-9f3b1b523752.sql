-- Add brand_color column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#2563eb';

-- Add a comment explaining the field
COMMENT ON COLUMN public.organizations.brand_color IS 'Corporate brand color in hex format (e.g., #2563eb). Used throughout the app and in exported PDFs.';