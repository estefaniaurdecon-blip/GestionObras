-- Add updated_by field to company_portfolio table
ALTER TABLE public.company_portfolio 
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- Create trigger to automatically set updated_by
CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for updates
CREATE TRIGGER set_company_portfolio_updated_by
BEFORE UPDATE ON public.company_portfolio
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_by();