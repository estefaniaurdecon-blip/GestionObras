-- Create table for calendar tasks
CREATE TABLE public.calendar_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  created_by UUID NOT NULL,
  assigned_to UUID,
  work_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  task_date DATE NOT NULL,
  due_time TIME,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tasks in their organization
CREATE POLICY "Users can view tasks in their org"
ON public.calendar_tasks
FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);

-- Policy: Users can create tasks in their org
CREATE POLICY "Users can create tasks in their org"
ON public.calendar_tasks
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND created_by = auth.uid()
);

-- Policy: Users can update their own tasks or if assigned
CREATE POLICY "Users can update tasks"
ON public.calendar_tasks
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- Policy: Users can delete their own tasks or admins
CREATE POLICY "Users can delete tasks"
ON public.calendar_tasks
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- Create indexes for better performance
CREATE INDEX idx_calendar_tasks_org_date ON public.calendar_tasks(organization_id, task_date);
CREATE INDEX idx_calendar_tasks_assigned ON public.calendar_tasks(assigned_to);
CREATE INDEX idx_calendar_tasks_work ON public.calendar_tasks(work_id);
CREATE INDEX idx_calendar_tasks_status ON public.calendar_tasks(status);

-- Create trigger for updated_at
CREATE TRIGGER update_calendar_tasks_updated_at
BEFORE UPDATE ON public.calendar_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();