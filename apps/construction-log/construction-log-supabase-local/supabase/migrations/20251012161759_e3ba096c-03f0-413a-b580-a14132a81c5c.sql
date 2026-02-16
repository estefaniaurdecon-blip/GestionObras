-- Add status column to work_reports table
ALTER TABLE work_reports 
ADD COLUMN status text DEFAULT 'missing_data' 
CHECK (status IN ('completed', 'missing_data', 'missing_delivery_notes'));

-- Add index for better query performance
CREATE INDEX idx_work_reports_status ON work_reports(status);