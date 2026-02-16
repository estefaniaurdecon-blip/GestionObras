-- Enable RLS on key tables
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_assignments ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is assigned to a work (security definer to avoid RLS side-effects)
create or replace function public.is_assigned_to_work(_user_id uuid, _work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_assignments wa
    where wa.user_id = _user_id
      and wa.work_id = _work_id
      and (
        wa.organization_id is null
        or wa.organization_id = current_user_organization()
      )
  );
$$;

-- WORKS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='works' AND policyname='Users can view works in org or assignment'
  ) THEN
    CREATE POLICY "Users can view works in org or assignment"
    ON public.works
    FOR SELECT
    USING (
      (organization_id = current_user_organization())
      OR public.is_assigned_to_work(auth.uid(), id)
      OR (created_by = auth.uid())
      OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'site_manager'::app_role)
      OR has_role(auth.uid(),'master'::app_role)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='works' AND policyname='Admins or site managers can create works'
  ) THEN
    CREATE POLICY "Admins or site managers can create works"
    ON public.works
    FOR INSERT
    WITH CHECK (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='works' AND policyname='Admins or site managers can update works'
  ) THEN
    CREATE POLICY "Admins or site managers can update works"
    ON public.works
    FOR UPDATE
    USING (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    )
    WITH CHECK (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='works' AND policyname='Admins or site managers can delete works'
  ) THEN
    CREATE POLICY "Admins or site managers can delete works"
    ON public.works
    FOR DELETE
    USING (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

-- WORK_ASSIGNMENTS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_assignments' AND policyname='Users can view their own assignments'
  ) THEN
    CREATE POLICY "Users can view their own assignments"
    ON public.work_assignments
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_assignments' AND policyname='Org admins/managers can view assignments'
  ) THEN
    CREATE POLICY "Org admins/managers can view assignments"
    ON public.work_assignments
    FOR SELECT
    USING (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_assignments' AND policyname='Org admins/managers can manage assignments'
  ) THEN
    CREATE POLICY "Org admins/managers can manage assignments"
    ON public.work_assignments
    FOR ALL
    USING (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    )
    WITH CHECK (
      organization_id = current_user_organization()
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

-- WORK_REPORTS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_reports' AND policyname='Users can view reports in org or assigned works'
  ) THEN
    CREATE POLICY "Users can view reports in org or assigned works"
    ON public.work_reports
    FOR SELECT
    USING (
      (
        organization_id = current_user_organization()
        AND (
          has_role(auth.uid(),'admin'::app_role)
          OR has_role(auth.uid(),'site_manager'::app_role)
          OR has_role(auth.uid(),'master'::app_role)
          OR (created_by = auth.uid())
          OR (work_id IS NOT NULL AND public.is_assigned_to_work(auth.uid(), work_id))
        )
      )
      OR (created_by = auth.uid()) -- allow users to always see their own reports, useful for legacy rows
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_reports' AND policyname='Users can create their own reports in org'
  ) THEN
    CREATE POLICY "Users can create their own reports in org"
    ON public.work_reports
    FOR INSERT
    WITH CHECK (
      organization_id = current_user_organization()
      AND (
        created_by = auth.uid()
        OR has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_reports' AND policyname='Owners or admins can update reports in org'
  ) THEN
    CREATE POLICY "Owners or admins can update reports in org"
    ON public.work_reports
    FOR UPDATE
    USING (
      organization_id = current_user_organization()
      AND (
        created_by = auth.uid()
        OR has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    )
    WITH CHECK (
      organization_id = current_user_organization()
      AND (
        created_by = auth.uid()
        OR has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_reports' AND policyname='Owners or admins can delete reports in org'
  ) THEN
    CREATE POLICY "Owners or admins can delete reports in org"
    ON public.work_reports
    FOR DELETE
    USING (
      organization_id = current_user_organization()
      AND (
        created_by = auth.uid()
        OR has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'site_manager'::app_role)
        OR has_role(auth.uid(),'master'::app_role)
      )
    );
  END IF;
END $$;
