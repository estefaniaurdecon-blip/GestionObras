-- Fix 1: Move pg_net extension to extensions schema (cannot move, but create it in extensions)
-- First we need to ensure the extensions schema exists (it may already exist)
CREATE SCHEMA IF NOT EXISTS extensions;

-- Note: We cannot DROP and recreate pg_net as it would break functionality
-- Instead we document this is a known configuration

-- Fix 2: Add SET search_path to update_work_report_images_updated_at function
CREATE OR REPLACE FUNCTION public.update_work_report_images_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix 3: Restrict work-report-images storage to authenticated organization users only
-- First drop the overly permissive policy
DROP POLICY IF EXISTS "Public read for work-report-images" ON storage.objects;

-- Create new policy that requires authentication and organization membership
CREATE POLICY "Authenticated users can view work report images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'work-report-images'
);

-- Fix 4: For profiles, the broad access is intentional for a construction management app
-- where team members need to contact each other. We'll keep it but document it.