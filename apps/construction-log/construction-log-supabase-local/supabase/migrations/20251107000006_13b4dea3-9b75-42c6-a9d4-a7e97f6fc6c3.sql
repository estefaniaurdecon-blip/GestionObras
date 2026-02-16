-- Add completed_sections field to work_reports table
ALTER TABLE work_reports 
ADD COLUMN IF NOT EXISTS completed_sections jsonb DEFAULT '[]'::jsonb;