-- Create table for custom holidays per organization
CREATE TABLE IF NOT EXISTS public.custom_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view holidays in their org"
  ON public.custom_holidays
  FOR SELECT
  USING (organization_id = current_user_organization());

CREATE POLICY "Admins can insert holidays"
  ON public.custom_holidays
  FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization() 
    AND (
      has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'master'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
    )
  );

CREATE POLICY "Admins can update holidays"
  ON public.custom_holidays
  FOR UPDATE
  USING (
    organization_id = current_user_organization() 
    AND (
      has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'master'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
    )
  );

CREATE POLICY "Admins can delete holidays"
  ON public.custom_holidays
  FOR DELETE
  USING (
    organization_id = current_user_organization() 
    AND (
      has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'master'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
    )
  );

-- Create index for better performance
CREATE INDEX idx_custom_holidays_org_date ON public.custom_holidays(organization_id, date);

-- Create trigger for updated_at
CREATE TRIGGER update_custom_holidays_updated_at
  BEFORE UPDATE ON public.custom_holidays
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();