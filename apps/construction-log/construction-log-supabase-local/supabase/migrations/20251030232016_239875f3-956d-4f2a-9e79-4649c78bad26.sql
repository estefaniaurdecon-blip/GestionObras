
-- Drop the global unique constraint on work number
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_number_key;

-- Create a new unique constraint that scopes work numbers to organizations
-- This allows different organizations to use the same work number
ALTER TABLE public.works 
  ADD CONSTRAINT works_organization_number_unique 
  UNIQUE (organization_id, number);

-- Add a comment explaining this constraint
COMMENT ON CONSTRAINT works_organization_number_unique ON public.works IS 
  'Work numbers must be unique within each organization, but different organizations can use the same number';
