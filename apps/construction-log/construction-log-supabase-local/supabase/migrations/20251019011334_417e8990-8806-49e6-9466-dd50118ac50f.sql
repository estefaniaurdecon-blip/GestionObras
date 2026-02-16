-- Create access_control_reports table
CREATE TABLE IF NOT EXISTS public.access_control_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  date date NOT NULL,
  site_name text NOT NULL,
  responsible text NOT NULL,
  responsible_entry_time text,
  responsible_exit_time text,
  observations text,
  personal_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  machinery_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.access_control_reports ENABLE ROW LEVEL SECURITY;

-- Users can view reports in their organization
CREATE POLICY "Users can view access reports in their org"
  ON public.access_control_reports
  FOR SELECT
  USING (
    organization_id = current_user_organization() AND
    (
      created_by = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'master'::app_role) OR
      has_role(auth.uid(), 'site_manager'::app_role)
    )
  );

-- Users can create reports in their organization
CREATE POLICY "Users can create access reports in their org"
  ON public.access_control_reports
  FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization() AND
    created_by = auth.uid()
  );

-- Owners or admins can update reports
CREATE POLICY "Owners or admins can update access reports"
  ON public.access_control_reports
  FOR UPDATE
  USING (
    organization_id = current_user_organization() AND
    (
      created_by = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'site_manager'::app_role) OR
      has_role(auth.uid(), 'master'::app_role)
    )
  )
  WITH CHECK (
    organization_id = current_user_organization() AND
    (
      created_by = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'site_manager'::app_role) OR
      has_role(auth.uid(), 'master'::app_role)
    )
  );

-- Owners or admins can delete reports
CREATE POLICY "Owners or admins can delete access reports"
  ON public.access_control_reports
  FOR DELETE
  USING (
    organization_id = current_user_organization() AND
    (
      created_by = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'site_manager'::app_role) OR
      has_role(auth.uid(), 'master'::app_role)
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_access_control_reports_updated_at
  BEFORE UPDATE ON public.access_control_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();