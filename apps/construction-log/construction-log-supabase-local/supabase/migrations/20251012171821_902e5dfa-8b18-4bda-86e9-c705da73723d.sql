-- Add multi-status support for work reports
ALTER TABLE public.work_reports
ADD COLUMN IF NOT EXISTS missing_delivery_notes boolean NOT NULL DEFAULT false;