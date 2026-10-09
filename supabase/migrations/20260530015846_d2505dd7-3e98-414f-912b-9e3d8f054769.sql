CREATE SCHEMA IF NOT EXISTS app_private;

GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION app_private.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND app_private.is_workspace_member(p.workspace_id, _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND app_private.has_workspace_role(p.workspace_id, _user_id, ARRAY['owner','admin','member']::public.workspace_role[])
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_task(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id AND app_private.can_access_project(t.project_id, _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.shares_workspace_with(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m1
    JOIN public.workspace_members m2 ON m1.workspace_id = m2.workspace_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  )
$$;

GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_workspace_role(uuid, uuid, public.workspace_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_edit_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_task(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.shares_workspace_with(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select_self_or_shared_ws ON public.profiles;
CREATE POLICY profiles_select_self_or_shared_ws
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR app_private.shares_workspace_with(auth.uid(), id));

DROP POLICY IF EXISTS workspaces_select_members ON public.workspaces;
CREATE POLICY workspaces_select_members
ON public.workspaces
FOR SELECT
TO authenticated
USING (app_private.is_workspace_member(id, auth.uid()));

DROP POLICY IF EXISTS workspaces_update_admins ON public.workspaces;
CREATE POLICY workspaces_update_admins
ON public.workspaces
FOR UPDATE
TO authenticated
USING (app_private.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

DROP POLICY IF EXISTS wm_select_members ON public.workspace_members;
CREATE POLICY wm_select_members
ON public.workspace_members
FOR SELECT
TO authenticated
USING (app_private.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS wm_delete_admins_or_self ON public.workspace_members;
CREATE POLICY wm_delete_admins_or_self
ON public.workspace_members
FOR DELETE
TO authenticated
USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR user_id = auth.uid());

DROP POLICY IF EXISTS wm_insert_admins_or_self_first ON public.workspace_members;
CREATE POLICY wm_insert_admins_or_self_first
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  )
  AND (
    role <> 'owner'::public.workspace_role
    OR app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::public.workspace_role[])
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS wm_update_admins ON public.workspace_members;
CREATE POLICY wm_update_admins
ON public.workspace_members
FOR UPDATE
TO authenticated
USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
WITH CHECK (
  app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  AND (
    role <> 'owner'::public.workspace_role
    OR app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::public.workspace_role[])
  )
);

DROP POLICY IF EXISTS invitations_select_admins_or_invitee ON public.workspace_invitations;
CREATE POLICY invitations_select_admins_or_invitee
ON public.workspace_invitations
FOR SELECT
TO authenticated
USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR lower(email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS invitations_insert_admins ON public.workspace_invitations;
CREATE POLICY invitations_insert_admins
ON public.workspace_invitations
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) AND invited_by = auth.uid());

DROP POLICY IF EXISTS invitations_delete_admins_or_invitee ON public.workspace_invitations;
CREATE POLICY invitations_delete_admins_or_invitee
ON public.workspace_invitations
FOR DELETE
TO authenticated
USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR lower(email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS projects_select_members ON public.projects;
CREATE POLICY projects_select_members
ON public.projects
FOR SELECT
TO authenticated
USING (app_private.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS projects_insert_members ON public.projects;
CREATE POLICY projects_insert_members
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','member']::public.workspace_role[]) AND created_by = auth.uid());

DROP POLICY IF EXISTS projects_update_members ON public.projects;
CREATE POLICY projects_update_members
ON public.projects
FOR UPDATE
TO authenticated
USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','member']::public.workspace_role[]));

DROP POLICY IF EXISTS projects_delete_admins ON public.projects;
CREATE POLICY projects_delete_admins
ON public.projects
FOR DELETE
TO authenticated
USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

DROP POLICY IF EXISTS tasks_select_members ON public.tasks;
CREATE POLICY tasks_select_members
ON public.tasks
FOR SELECT
TO authenticated
USING (app_private.can_access_project(project_id, auth.uid()));

DROP POLICY IF EXISTS tasks_insert_members ON public.tasks;
CREATE POLICY tasks_insert_members
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (app_private.can_edit_project(project_id, auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS tasks_update_members ON public.tasks;
CREATE POLICY tasks_update_members
ON public.tasks
FOR UPDATE
TO authenticated
USING (app_private.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS tasks_delete_members ON public.tasks;
CREATE POLICY tasks_delete_members
ON public.tasks
FOR DELETE
TO authenticated
USING (app_private.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS comments_select ON public.task_comments;
CREATE POLICY comments_select
ON public.task_comments
FOR SELECT
TO authenticated
USING (app_private.can_access_task(task_id, auth.uid()));

DROP POLICY IF EXISTS comments_insert ON public.task_comments;
CREATE POLICY comments_insert
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (app_private.can_access_task(task_id, auth.uid()) AND author_id = auth.uid());

DROP POLICY IF EXISTS attachments_select ON public.task_attachments;
CREATE POLICY attachments_select
ON public.task_attachments
FOR SELECT
TO authenticated
USING (app_private.can_access_task(task_id, auth.uid()));

DROP POLICY IF EXISTS attachments_insert ON public.task_attachments;
CREATE POLICY attachments_insert
ON public.task_attachments
FOR INSERT
TO authenticated
WITH CHECK (app_private.can_access_task(task_id, auth.uid()) AND uploader_id = auth.uid());

DROP POLICY IF EXISTS attachments_storage_select ON storage.objects;
CREATE POLICY attachments_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'task-attachments' AND app_private.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid()));

DROP POLICY IF EXISTS attachments_storage_insert ON storage.objects;
CREATE POLICY attachments_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-attachments' AND app_private.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid()));

DROP POLICY IF EXISTS attachments_storage_delete ON storage.objects;
CREATE POLICY attachments_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'task-attachments' AND app_private.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid()));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_task(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) FROM anon, authenticated, public;