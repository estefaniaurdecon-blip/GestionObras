
-- Enable RLS on work_rental_machinery_assignments table
ALTER TABLE work_rental_machinery_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view assignments from their organization
CREATE POLICY "Users can view rental machinery assignments from their organization"
ON work_rental_machinery_assignments
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy: Users can create assignments for their organization
CREATE POLICY "Users can create rental machinery assignments for their organization"
ON work_rental_machinery_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy: Users can update assignments from their organization
CREATE POLICY "Users can update rental machinery assignments from their organization"
ON work_rental_machinery_assignments
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy: Users can delete assignments from their organization
CREATE POLICY "Users can delete rental machinery assignments from their organization"
ON work_rental_machinery_assignments
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
);
