-- Ensure RLS enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies idempotently
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Users can view their own roles'
  ) THEN
    CREATE POLICY "Users can view their own roles"
    ON public.user_roles
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Org admins or masters can view organization roles'
  ) THEN
    CREATE POLICY "Org admins or masters can view organization roles"
    ON public.user_roles
    FOR SELECT
    USING (
      organization_id = current_user_organization()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Org admins or masters can assign roles'
  ) THEN
    CREATE POLICY "Org admins or masters can assign roles"
    ON public.user_roles
    FOR INSERT
    WITH CHECK (
      organization_id = current_user_organization()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Org admins or masters can update roles'
  ) THEN
    CREATE POLICY "Org admins or masters can update roles"
    ON public.user_roles
    FOR UPDATE
    USING (
      organization_id = current_user_organization()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
    )
    WITH CHECK (
      organization_id = current_user_organization()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Org admins or masters can revoke roles'
  ) THEN
    CREATE POLICY "Org admins or masters can revoke roles"
    ON public.user_roles
    FOR DELETE
    USING (
      organization_id = current_user_organization()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
    );
  END IF;
END $$;
