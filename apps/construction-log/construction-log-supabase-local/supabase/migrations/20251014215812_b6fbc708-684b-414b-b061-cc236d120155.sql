-- Corregir políticas RLS agregando restricción explícita TO authenticated
-- Esto corrige las advertencias de "Anonymous Access Policies"

-- ============================================
-- TABLE: app_versions
-- ============================================
DROP POLICY IF EXISTS "Anyone can view published versions" ON public.app_versions;
DROP POLICY IF EXISTS "Only admins can delete versions" ON public.app_versions;
DROP POLICY IF EXISTS "Only admins can update versions" ON public.app_versions;
DROP POLICY IF EXISTS "Only admins can insert versions" ON public.app_versions;

CREATE POLICY "Anyone can view published versions" 
ON public.app_versions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can delete versions" 
ON public.app_versions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update versions" 
ON public.app_versions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert versions" 
ON public.app_versions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- TABLE: company_settings
-- ============================================
DROP POLICY IF EXISTS "Org admins can manage company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Org users can view company settings" ON public.company_settings;

CREATE POLICY "Org admins can manage company settings" 
ON public.company_settings
FOR ALL
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)))
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Org users can view company settings" 
ON public.company_settings
FOR SELECT
TO authenticated
USING (organization_id = current_user_organization());

-- ============================================
-- TABLE: messages
-- ============================================
DROP POLICY IF EXISTS "Users can delete their messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update received messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;

CREATE POLICY "Users can delete their messages" 
ON public.messages
FOR DELETE
TO authenticated
USING ((auth.uid() = from_user_id) OR (auth.uid() = to_user_id));

CREATE POLICY "Users can send messages" 
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = from_user_id) AND ((organization_id IS NULL) OR (organization_id = current_user_organization())) AND same_organization(to_user_id));

CREATE POLICY "Users can update received messages" 
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = to_user_id)
WITH CHECK (auth.uid() = to_user_id);

CREATE POLICY "Users can view their messages" 
ON public.messages
FOR SELECT
TO authenticated
USING ((auth.uid() = from_user_id) OR (auth.uid() = to_user_id));

-- ============================================
-- TABLE: notifications
-- ============================================
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Users can delete their own notifications" 
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" 
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own notifications" 
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- TABLE: organizations
-- ============================================
DROP POLICY IF EXISTS "Masters, Admins, and Site Managers can update their organizatio" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;

CREATE POLICY "Masters, Admins, and Site Managers can update their organization" 
ON public.organizations
FOR UPDATE
TO authenticated
USING ((id = current_user_organization()) AND (has_role(auth.uid(), 'master'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role)))
WITH CHECK ((id = current_user_organization()) AND (has_role(auth.uid(), 'master'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role)));

CREATE POLICY "Users can view their organization" 
ON public.organizations
FOR SELECT
TO authenticated
USING (id = current_user_organization());

-- ============================================
-- TABLE: profiles
-- ============================================
DROP POLICY IF EXISTS "Admins can manage organization profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view organization profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Admins can manage organization profiles" 
ON public.profiles
FOR ALL
TO authenticated
USING ((auth.uid() = id) OR (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = current_user_organization())));

CREATE POLICY "Users can update their own profile" 
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can view organization profiles" 
ON public.profiles
FOR SELECT
TO authenticated
USING ((auth.uid() = id) OR ((organization_id IS NOT NULL) AND (organization_id = current_user_organization())));

CREATE POLICY "Users can view their own profile" 
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- ============================================
-- TABLE: push_subscriptions
-- ============================================
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can manage their own push subscriptions" 
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- TABLE: saved_economic_reports
-- ============================================
DROP POLICY IF EXISTS "Users can delete their saved reports" ON public.saved_economic_reports;
DROP POLICY IF EXISTS "Users can insert their saved reports" ON public.saved_economic_reports;
DROP POLICY IF EXISTS "Users can update their saved reports" ON public.saved_economic_reports;
DROP POLICY IF EXISTS "Users can view their saved reports or org admins" ON public.saved_economic_reports;

CREATE POLICY "Users can delete their saved reports" 
ON public.saved_economic_reports
FOR DELETE
TO authenticated
USING (saved_by = auth.uid());

CREATE POLICY "Users can insert their saved reports" 
ON public.saved_economic_reports
FOR INSERT
TO authenticated
WITH CHECK ((saved_by = auth.uid()) AND ((organization_id IS NULL) OR (organization_id = current_user_organization())));

CREATE POLICY "Users can update their saved reports" 
ON public.saved_economic_reports
FOR UPDATE
TO authenticated
USING (saved_by = auth.uid())
WITH CHECK (saved_by = auth.uid());

CREATE POLICY "Users can view their saved reports or org admins" 
ON public.saved_economic_reports
FOR SELECT
TO authenticated
USING ((saved_by = auth.uid()) OR ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role))));

-- ============================================
-- TABLE: shared_files
-- ============================================
DROP POLICY IF EXISTS "Users can delete received files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can delete sent files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can share files within organization" ON public.shared_files;
DROP POLICY IF EXISTS "Users can update received files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can view received files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can view sent files" ON public.shared_files;

CREATE POLICY "Users can delete received files" 
ON public.shared_files
FOR DELETE
TO authenticated
USING (auth.uid() = to_user_id);

CREATE POLICY "Users can delete sent files" 
ON public.shared_files
FOR DELETE
TO authenticated
USING (auth.uid() = from_user_id);

CREATE POLICY "Users can share files within organization" 
ON public.shared_files
FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = from_user_id) AND same_organization(to_user_id) AND ((organization_id IS NULL) OR (organization_id = current_user_organization())));

CREATE POLICY "Users can update received files" 
ON public.shared_files
FOR UPDATE
TO authenticated
USING (auth.uid() = to_user_id)
WITH CHECK (auth.uid() = to_user_id);

CREATE POLICY "Users can view received files" 
ON public.shared_files
FOR SELECT
TO authenticated
USING (auth.uid() = to_user_id);

CREATE POLICY "Users can view sent files" 
ON public.shared_files
FOR SELECT
TO authenticated
USING (auth.uid() = from_user_id);

-- ============================================
-- TABLE: user_roles
-- ============================================
DROP POLICY IF EXISTS "Org admins or masters can assign roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can revoke roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins or masters can view organization roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Org admins or masters can assign roles" 
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Org admins or masters can revoke roles" 
ON public.user_roles
FOR DELETE
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Org admins or masters can update roles" 
ON public.user_roles
FOR UPDATE
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role)))
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Org admins or masters can view organization roles" 
ON public.user_roles
FOR SELECT
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Users can view their own roles" 
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- TABLE: work_assignments
-- ============================================
DROP POLICY IF EXISTS "Admins and managers can delete assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Admins and managers can insert assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Admins and managers can update assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Org admins/managers can view assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.work_assignments;

CREATE POLICY "Admins and managers can delete assignments" 
ON public.work_assignments
FOR DELETE
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Admins and managers can insert assignments" 
ON public.work_assignments
FOR INSERT
TO authenticated
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Admins and managers can update assignments" 
ON public.work_assignments
FOR UPDATE
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)))
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Org admins/managers can view assignments" 
ON public.work_assignments
FOR SELECT
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Users can view their own assignments" 
ON public.work_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- TABLE: work_inventory
-- ============================================
DROP POLICY IF EXISTS "Admins and managers can manage inventory" ON public.work_inventory;
DROP POLICY IF EXISTS "Users can view inventory of their works" ON public.work_inventory;

CREATE POLICY "Admins and managers can manage inventory" 
ON public.work_inventory
FOR ALL
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)))
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Users can view inventory of their works" 
ON public.work_inventory
FOR SELECT
TO authenticated
USING ((organization_id = current_user_organization()) OR (EXISTS ( SELECT 1
   FROM work_assignments wa
  WHERE ((wa.work_id = work_inventory.work_id) AND (wa.user_id = auth.uid())))));

-- ============================================
-- TABLE: work_inventory_sync_log
-- ============================================
DROP POLICY IF EXISTS "Admins and managers can view sync log" ON public.work_inventory_sync_log;
DROP POLICY IF EXISTS "System can manage sync log" ON public.work_inventory_sync_log;

CREATE POLICY "Admins and managers can view sync log" 
ON public.work_inventory_sync_log
FOR SELECT
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

-- Nota: "System can manage sync log" usa true/true que es apropiado para operaciones del sistema
CREATE POLICY "System can manage sync log" 
ON public.work_inventory_sync_log
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- TABLE: work_report_comments
-- ============================================
DROP POLICY IF EXISTS "Admins/managers can delete comments in org" ON public.work_report_comments;
DROP POLICY IF EXISTS "Users can create comments on accessible reports" ON public.work_report_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.work_report_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.work_report_comments;
DROP POLICY IF EXISTS "Users can view comments of accessible reports" ON public.work_report_comments;

CREATE POLICY "Admins/managers can delete comments in org" 
ON public.work_report_comments
FOR DELETE
TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)) AND (EXISTS ( SELECT 1
   FROM work_reports wr
  WHERE ((wr.id = work_report_comments.work_report_id) AND (wr.organization_id = current_user_organization())))));

CREATE POLICY "Users can create comments on accessible reports" 
ON public.work_report_comments
FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM work_reports wr
  WHERE ((wr.id = work_report_comments.work_report_id) AND ((wr.created_by = auth.uid()) OR ((wr.organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role) OR (has_role(auth.uid(), 'site_manager'::app_role) AND (wr.status = 'completed'::text)))) OR ((wr.work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), wr.work_id)))))));

CREATE POLICY "Users can delete their own comments" 
ON public.work_report_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" 
ON public.work_report_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view comments of accessible reports" 
ON public.work_report_comments
FOR SELECT
TO authenticated
USING (EXISTS ( SELECT 1
   FROM work_reports wr
  WHERE ((wr.id = work_report_comments.work_report_id) AND ((wr.created_by = auth.uid()) OR ((wr.organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role) OR (has_role(auth.uid(), 'site_manager'::app_role) AND (wr.status = 'completed'::text)))) OR ((wr.work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), wr.work_id))))));

-- ============================================
-- TABLE: work_reports
-- ============================================
DROP POLICY IF EXISTS "Owners or admins can delete reports in org" ON public.work_reports;
DROP POLICY IF EXISTS "Owners or admins can update reports in org" ON public.work_reports;
DROP POLICY IF EXISTS "Users can create their own reports in org" ON public.work_reports;
DROP POLICY IF EXISTS "Users can view reports with role filters" ON public.work_reports;
DROP POLICY IF EXISTS "view_reports_role_based" ON public.work_reports;

CREATE POLICY "Owners or admins can delete reports in org" 
ON public.work_reports
FOR DELETE
TO authenticated
USING ((organization_id = current_user_organization()) AND ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Owners or admins can update reports in org" 
ON public.work_reports
FOR UPDATE
TO authenticated
USING ((organization_id = current_user_organization()) AND ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)))
WITH CHECK ((organization_id = current_user_organization()) AND ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Users can create their own reports in org" 
ON public.work_reports
FOR INSERT
TO authenticated
WITH CHECK ((organization_id = current_user_organization()) AND ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)) AND ((work_id IS NULL) OR ((work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), work_id)) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Users can view reports with role filters" 
ON public.work_reports
FOR SELECT
TO authenticated
USING ((created_by = auth.uid()) OR ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))) OR ((organization_id = current_user_organization()) AND has_role(auth.uid(), 'site_manager'::app_role) AND (status = 'completed'::text)) OR ((work_id IS NOT NULL) AND is_assigned_to_work(auth.uid(), work_id)));

-- ============================================
-- TABLE: works
-- ============================================
DROP POLICY IF EXISTS "Admins or site managers can create works" ON public.works;
DROP POLICY IF EXISTS "Admins or site managers can delete works" ON public.works;
DROP POLICY IF EXISTS "Admins or site managers can update works" ON public.works;
DROP POLICY IF EXISTS "Users can view works in org or assignment" ON public.works;

CREATE POLICY "Admins or site managers can create works" 
ON public.works
FOR INSERT
TO authenticated
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Admins or site managers can delete works" 
ON public.works
FOR DELETE
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Admins or site managers can update works" 
ON public.works
FOR UPDATE
TO authenticated
USING ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)))
WITH CHECK ((organization_id = current_user_organization()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role)));

CREATE POLICY "Users can view works in org or assignment" 
ON public.works
FOR SELECT
TO authenticated
USING ((organization_id = current_user_organization()) OR is_assigned_to_work(auth.uid(), id) OR (created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role));

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Storage: shared-files bucket
DROP POLICY IF EXISTS "Users can view files shared with them" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their shared files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

CREATE POLICY "Users can view files shared with them"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shared-files' AND
  EXISTS (
    SELECT 1 FROM public.shared_files
    WHERE file_path = name AND to_user_id = auth.uid()
  )
);

CREATE POLICY "Users can view their shared files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shared-files' AND
  EXISTS (
    SELECT 1 FROM public.shared_files
    WHERE file_path = name AND from_user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shared-files' AND
  EXISTS (
    SELECT 1 FROM public.shared_files
    WHERE file_path = name AND from_user_id = auth.uid()
  )
);

-- Storage: work-report-images bucket
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Public read for work-report-images" ON storage.objects;

CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'work-report-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'work-report-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Esta política permite lectura pública intencionalmente
CREATE POLICY "Public read for work-report-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'work-report-images');

-- Storage: company-logos bucket
DROP POLICY IF EXISTS "Los usuarios pueden actualizar su logo" ON storage.objects;
DROP POLICY IF EXISTS "Los usuarios pueden eliminar su logo" ON storage.objects;
DROP POLICY IF EXISTS "Org managers can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Org managers can delete company logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read company logos" ON storage.objects;
DROP POLICY IF EXISTS "Los logos son públicos" ON storage.objects;

CREATE POLICY "Org managers can update company logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role))
);

CREATE POLICY "Org managers can delete company logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'master'::app_role))
);

-- Esta política permite lectura pública intencionalmente
CREATE POLICY "Public can read company logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-logos');

-- Storage: app-updates bucket
DROP POLICY IF EXISTS "Anyone can view app updates" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can download update files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update app updates" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete app updates" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can delete update files" ON storage.objects;

-- Estas políticas permiten lectura pública intencionalmente
CREATE POLICY "Anyone can view app updates"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'app-updates');

CREATE POLICY "Admins can update app updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'app-updates' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete app updates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'app-updates' AND has_role(auth.uid(), 'admin'::app_role));