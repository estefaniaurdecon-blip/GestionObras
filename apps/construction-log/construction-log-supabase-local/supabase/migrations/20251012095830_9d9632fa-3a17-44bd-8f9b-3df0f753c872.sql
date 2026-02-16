-- Enable RLS and add secure role policies for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Allow org admins or masters to view roles within their org
CREATE POLICY "Org admins or masters can view organization roles"
ON public.user_roles
FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
);

-- Allow org admins or masters to assign roles within their org
CREATE POLICY "Org admins or masters can assign roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
);

-- Allow org admins or masters to update roles within their org
CREATE POLICY "Org admins or masters can update roles"
ON public.user_roles
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
)
WITH CHECK (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
);

-- Allow org admins or masters to revoke roles within their org
CREATE POLICY "Org admins or masters can revoke roles"
ON public.user_roles
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
);
