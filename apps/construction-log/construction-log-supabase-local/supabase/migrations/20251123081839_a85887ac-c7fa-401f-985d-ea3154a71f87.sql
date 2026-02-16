-- Create work_report_images table for multiple images per work report
CREATE TABLE IF NOT EXISTS public.work_report_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_work_report_images_work_report_id ON public.work_report_images(work_report_id);
CREATE INDEX IF NOT EXISTS idx_work_report_images_display_order ON public.work_report_images(work_report_id, display_order);

-- Enable RLS
ALTER TABLE public.work_report_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view images of accessible reports"
ON public.work_report_images FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM work_reports wr
    WHERE wr.id = work_report_images.work_report_id
    AND (
      wr.created_by = auth.uid()
      OR (
        wr.organization_id = current_user_organization()
        AND (
          has_role(auth.uid(), 'admin') 
          OR has_role(auth.uid(), 'master')
          OR (has_role(auth.uid(), 'site_manager') AND wr.status = 'completed')
        )
      )
      OR (wr.work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), wr.work_id))
    )
  )
);

CREATE POLICY "Users can insert images for their reports"
ON public.work_report_images FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM work_reports wr
    WHERE wr.id = work_report_images.work_report_id
    AND (
      wr.created_by = auth.uid()
      OR (wr.work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), wr.work_id))
    )
  )
);

CREATE POLICY "Users can update images of their reports"
ON public.work_report_images FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM work_reports wr
    WHERE wr.id = work_report_images.work_report_id
    AND (
      wr.created_by = auth.uid()
      OR (wr.work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), wr.work_id))
    )
  )
);

CREATE POLICY "Users can delete images of their reports"
ON public.work_report_images FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM work_reports wr
    WHERE wr.id = work_report_images.work_report_id
    AND (
      wr.created_by = auth.uid()
      OR (wr.work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), wr.work_id))
    )
  )
);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_work_report_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_work_report_images_updated_at
  BEFORE UPDATE ON public.work_report_images
  FOR EACH ROW
  EXECUTE FUNCTION update_work_report_images_updated_at();