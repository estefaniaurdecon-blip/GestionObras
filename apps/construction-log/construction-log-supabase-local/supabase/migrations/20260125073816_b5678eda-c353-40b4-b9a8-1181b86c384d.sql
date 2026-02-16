-- Add subcontract_groups column to work_repasos for tracking personnel and machinery
-- Structure: [{ company: string, workers: [{ name, hours }], machinery: [{ type, hours }] }]

ALTER TABLE public.work_repasos 
ADD COLUMN IF NOT EXISTS subcontract_groups jsonb DEFAULT '[]'::jsonb;

-- Add comment to document the structure
COMMENT ON COLUMN public.work_repasos.subcontract_groups IS 'Array of company groups with workers and machinery: [{ company: string, workers: [{ name: string, hours: number }], machinery: [{ type: string, hours: number }] }]';