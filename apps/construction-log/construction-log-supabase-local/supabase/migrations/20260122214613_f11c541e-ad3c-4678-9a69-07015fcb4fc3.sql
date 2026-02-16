-- Add user_platform column to profiles table to track which platform each user uses
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_platform TEXT DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN public.profiles.user_platform IS 'Platform the user primarily uses: windows, android, web, or null for all platforms';