
-- Trigger missing for task completion
DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
CREATE TRIGGER tasks_set_completed_at
BEFORE UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_task_completion();

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS comments_set_updated_at ON public.task_comments;
CREATE TRIGGER comments_set_updated_at
BEFORE UPDATE ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pending workspace invitations
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  email TEXT NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_select_admins_or_invitee"
ON public.workspace_invitations FOR SELECT TO authenticated
USING (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  OR lower(email) = lower((auth.jwt() ->> 'email'))
);

CREATE POLICY "invitations_insert_admins"
ON public.workspace_invitations FOR INSERT TO authenticated
WITH CHECK (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  AND invited_by = auth.uid()
);

CREATE POLICY "invitations_delete_admins_or_invitee"
ON public.workspace_invitations FOR DELETE TO authenticated
USING (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  OR lower(email) = lower((auth.jwt() ->> 'email'))
);

-- Auto-accept pending invitations when a profile is created
CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT i.workspace_id, NEW.id, i.role
  FROM public.workspace_invitations i
  WHERE lower(i.email) = lower(NEW.email)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.workspace_invitations
  WHERE lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_pending_invitations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_profile_created_accept_invites ON public.profiles;
CREATE TRIGGER on_profile_created_accept_invites
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.accept_pending_invitations();

-- Storage policies for task-attachments bucket (path = task_id/filename)
DROP POLICY IF EXISTS "attachments_storage_select" ON storage.objects;
CREATE POLICY "attachments_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "attachments_storage_insert" ON storage.objects;
CREATE POLICY "attachments_storage_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND public.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "attachments_storage_delete" ON storage.objects;
CREATE POLICY "attachments_storage_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Enable realtime on tasks for live updates (optional but nice)
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
