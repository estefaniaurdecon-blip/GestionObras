-- Create table for saved economic reports
CREATE TABLE public.saved_economic_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_report_id UUID NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  work_name TEXT NOT NULL,
  work_number TEXT NOT NULL,
  date DATE NOT NULL,
  foreman TEXT,
  site_manager TEXT,
  work_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  machinery_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  material_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  subcontract_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  rental_machinery_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  saved_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_economic_reports ENABLE ROW LEVEL SECURITY;

-- Admins can view all saved reports
CREATE POLICY "Admins can view all saved economic reports"
ON public.saved_economic_reports
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Site managers can view saved reports from their assigned works
CREATE POLICY "Site managers can view their saved economic reports"
ON public.saved_economic_reports
FOR SELECT
USING (
  has_role(auth.uid(), 'site_manager'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.work_reports wr
    JOIN public.work_assignments wa ON wa.work_id = wr.work_id
    WHERE wr.id = saved_economic_reports.work_report_id
    AND wa.user_id = auth.uid()
  )
);

-- Admins and site managers can insert saved reports
CREATE POLICY "Admins and site managers can insert saved economic reports"
ON public.saved_economic_reports
FOR INSERT
WITH CHECK (
  auth.uid() = saved_by AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role))
);

-- Admins can delete saved reports
CREATE POLICY "Admins can delete saved economic reports"
ON public.saved_economic_reports
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_saved_economic_reports_date ON public.saved_economic_reports(date DESC);
CREATE INDEX idx_saved_economic_reports_saved_by ON public.saved_economic_reports(saved_by);