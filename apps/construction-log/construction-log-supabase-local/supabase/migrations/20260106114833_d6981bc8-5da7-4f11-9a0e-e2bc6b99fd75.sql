
-- Add unique constraint to prevent duplicate work reports
-- A work report is unique by work_id + date + work_number combination
CREATE UNIQUE INDEX IF NOT EXISTS unique_work_report_per_day 
ON work_reports (work_id, date, work_number) 
WHERE work_id IS NOT NULL;
