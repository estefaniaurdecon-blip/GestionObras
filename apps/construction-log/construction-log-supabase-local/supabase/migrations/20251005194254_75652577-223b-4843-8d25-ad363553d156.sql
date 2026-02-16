-- Remove Android version 2.0.4 from app_versions
DELETE FROM public.app_versions
WHERE platform = 'android' AND version = '2.0.4';
