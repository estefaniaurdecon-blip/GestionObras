-- Add rental_machinery_groups column to work_reports table
ALTER TABLE public.work_reports 
ADD COLUMN IF NOT EXISTS rental_machinery_groups jsonb DEFAULT '[]'::jsonb;