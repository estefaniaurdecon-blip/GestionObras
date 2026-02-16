-- Add foreman_entries column to work_reports table to store multiple foremen/capataces
ALTER TABLE public.work_reports 
ADD COLUMN IF NOT EXISTS foreman_entries JSONB DEFAULT '[]'::jsonb;