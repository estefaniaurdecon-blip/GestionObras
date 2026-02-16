
-- Delete duplicate work reports, keeping the most complete one for each work_id/date/work_number combination
-- "Most complete" is determined by: having more data (longer JSON content), then by most recent update

WITH duplicates_ranked AS (
  SELECT 
    id,
    work_id,
    date,
    work_number,
    work_name,
    -- Calculate a "completeness score" based on content length and presence of data
    COALESCE(LENGTH(work_groups::text), 0) +
    COALESCE(LENGTH(machinery_groups::text), 0) +
    COALESCE(LENGTH(material_groups::text), 0) +
    COALESCE(LENGTH(subcontract_groups::text), 0) +
    COALESCE(LENGTH(observations), 0) +
    CASE WHEN approved THEN 100 ELSE 0 END +
    CASE WHEN status = 'completed' THEN 50 ELSE 0 END AS completeness_score,
    updated_at,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY work_id, date, work_number 
      ORDER BY 
        -- First priority: completeness score (higher is better)
        (COALESCE(LENGTH(work_groups::text), 0) +
         COALESCE(LENGTH(machinery_groups::text), 0) +
         COALESCE(LENGTH(material_groups::text), 0) +
         COALESCE(LENGTH(subcontract_groups::text), 0) +
         COALESCE(LENGTH(observations), 0) +
         CASE WHEN approved THEN 100 ELSE 0 END +
         CASE WHEN status = 'completed' THEN 50 ELSE 0 END) DESC,
        -- Second priority: most recently updated
        updated_at DESC NULLS LAST,
        -- Third priority: most recently created
        created_at DESC
    ) AS rn
  FROM work_reports
  WHERE work_id IS NOT NULL
)
DELETE FROM work_reports
WHERE id IN (
  SELECT id 
  FROM duplicates_ranked 
  WHERE rn > 1
);
