-- Allow all users in an organization to read the organization row (for branding)
CREATE POLICY "Users can view their organization data"
ON public.organizations
FOR SELECT
USING (id = current_user_organization());