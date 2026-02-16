-- Add is_archived column to work_reports table
ALTER TABLE public.work_reports 
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

-- Add archived_at timestamp to track when it was archived
ALTER TABLE public.work_reports 
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;

-- Add archived_by to track who archived it
ALTER TABLE public.work_reports 
ADD COLUMN archived_by UUID REFERENCES auth.users(id);

-- Create index for efficient filtering of non-archived reports
CREATE INDEX idx_work_reports_is_archived ON public.work_reports(is_archived) WHERE is_archived = false;