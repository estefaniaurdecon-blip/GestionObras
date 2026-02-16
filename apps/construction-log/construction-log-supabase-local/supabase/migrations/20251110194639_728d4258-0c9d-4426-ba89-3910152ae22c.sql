-- Update function to fallback to email if full_name is null
CREATE OR REPLACE FUNCTION public.get_company_portfolio_with_names()
RETURNS TABLE (
  id uuid,
  company_name text,
  company_type text[],
  contact_person text,
  contact_phone text,
  contact_email text,
  address text,
  city text,
  postal_code text,
  country text,
  fiscal_id text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  organization_id uuid,
  created_by uuid,
  updated_by uuid,
  creator_name text,
  editor_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    cp.company_name,
    cp.company_type,
    cp.contact_person,
    cp.contact_phone,
    cp.contact_email,
    cp.address,
    cp.city,
    cp.postal_code,
    cp.country,
    cp.fiscal_id,
    cp.notes,
    cp.created_at,
    cp.updated_at,
    cp.organization_id,
    cp.created_by,
    cp.updated_by,
    COALESCE(p1.full_name, p1.email, '') AS creator_name,
    COALESCE(p2.full_name, p2.email, '') AS editor_name
  FROM public.company_portfolio cp
  LEFT JOIN public.profiles p1 ON p1.id = cp.created_by
  LEFT JOIN public.profiles p2 ON p2.id = cp.updated_by
  WHERE cp.organization_id = current_user_organization()
  ORDER BY cp.company_name;
$$;