-- Storage RLS policies for company-logos bucket
-- Allow public read of company logos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can read company logos'
  ) THEN
    CREATE POLICY "Public can read company logos"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'company-logos');
  END IF;
END $$;

-- Allow org managers to upload logos in their org folder
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Org managers can upload company logos'
  ) THEN
    CREATE POLICY "Org managers can upload company logos"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'company-logos'
      AND ((storage.foldername(name))[1] = public.current_user_organization()::text)
      AND (
        public.has_role(auth.uid(), 'master')
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'site_manager')
      )
    );
  END IF;
END $$;

-- Allow org managers to update logos in their org folder
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Org managers can update company logos'
  ) THEN
    CREATE POLICY "Org managers can update company logos"
    ON storage.objects
    FOR UPDATE
    USING (
      bucket_id = 'company-logos'
      AND ((storage.foldername(name))[1] = public.current_user_organization()::text)
      AND (
        public.has_role(auth.uid(), 'master')
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'site_manager')
      )
    )
    WITH CHECK (
      bucket_id = 'company-logos'
      AND ((storage.foldername(name))[1] = public.current_user_organization()::text)
    );
  END IF;
END $$;

-- Allow org managers to delete logos in their org folder
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Org managers can delete company logos'
  ) THEN
    CREATE POLICY "Org managers can delete company logos"
    ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'company-logos'
      AND ((storage.foldername(name))[1] = public.current_user_organization()::text)
      AND (
        public.has_role(auth.uid(), 'master')
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'site_manager')
      )
    );
  END IF;
END $$;
