-- Create table for Post-Venta management (identical structure to work_repasos)
CREATE TABLE public.work_postventas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  description TEXT NOT NULL,
  assigned_company TEXT,
  estimated_hours NUMERIC DEFAULT 0,
  actual_hours NUMERIC DEFAULT 0,
  before_image TEXT,
  after_image TEXT,
  subcontract_groups JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_work_postventas_work_id ON public.work_postventas(work_id);
CREATE INDEX idx_work_postventas_organization_id ON public.work_postventas(organization_id);
CREATE INDEX idx_work_postventas_status ON public.work_postventas(status);

-- Enable RLS
ALTER TABLE public.work_postventas ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same as work_repasos)
CREATE POLICY "Users can view postventas in their org"
ON public.work_postventas
FOR SELECT
USING (
  organization_id = current_user_organization() AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role) OR
    has_role(auth.uid(), 'foreman'::app_role) OR
    is_assigned_to_work(auth.uid(), work_id)
  )
);

CREATE POLICY "Admins and managers can create postventas"
ON public.work_postventas
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization() AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can update postventas"
ON public.work_postventas
FOR UPDATE
USING (
  organization_id = current_user_organization() AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization() AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can delete postventas"
ON public.work_postventas
FOR DELETE
USING (
  organization_id = current_user_organization() AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_work_postventas_updated_at
BEFORE UPDATE ON public.work_postventas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();