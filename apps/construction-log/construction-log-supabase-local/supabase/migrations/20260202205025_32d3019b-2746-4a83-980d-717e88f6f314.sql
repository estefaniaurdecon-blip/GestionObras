-- Create phases table for timeline/gantt chart
CREATE TABLE public.phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  responsible TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view phases in their org"
ON public.phases FOR SELECT
USING (organization_id = current_user_organization());

CREATE POLICY "Admins and managers can create phases"
ON public.phases FOR INSERT
WITH CHECK (
  organization_id = current_user_organization() AND
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'master'::app_role) OR 
   has_role(auth.uid(), 'site_manager'::app_role) OR
   has_role(auth.uid(), 'foreman'::app_role))
);

CREATE POLICY "Admins and managers can update phases"
ON public.phases FOR UPDATE
USING (
  organization_id = current_user_organization() AND
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'master'::app_role) OR 
   has_role(auth.uid(), 'site_manager'::app_role) OR
   has_role(auth.uid(), 'foreman'::app_role))
);

CREATE POLICY "Admins and managers can delete phases"
ON public.phases FOR DELETE
USING (
  organization_id = current_user_organization() AND
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'master'::app_role) OR 
   has_role(auth.uid(), 'site_manager'::app_role))
);

-- Trigger for updated_at
CREATE TRIGGER update_phases_updated_at
  BEFORE UPDATE ON public.phases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();