-- Make app_versions version unique per platform, not globally
-- 1) Drop existing unique constraint on version only
ALTER TABLE public.app_versions DROP CONSTRAINT IF EXISTS app_versions_version_key;

-- 2) Add new unique constraint on (platform, version)
ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_platform_version_key UNIQUE (platform, version);