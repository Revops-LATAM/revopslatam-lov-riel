
-- 1) Profiles: restrict SELECT to self + shared workspace members
CREATE OR REPLACE FUNCTION public.shares_workspace_with(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m1
    JOIN public.workspace_members m2 ON m1.workspace_id = m2.workspace_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  )
$$;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_self_or_shared_ws
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.shares_workspace_with(auth.uid(), id));

-- 2) Storage: drop overly-permissive duplicate policies
DROP POLICY IF EXISTS task_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS task_attachments_select ON storage.objects;
DROP POLICY IF EXISTS task_attachments_delete ON storage.objects;

-- 3) workspace_members: prevent role privilege escalation on INSERT/UPDATE
DROP POLICY IF EXISTS wm_insert_admins_or_self_first ON public.workspace_members;
CREATE POLICY wm_insert_admins_or_self_first
ON public.workspace_members FOR INSERT TO authenticated
WITH CHECK (
  (
    has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
    OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  )
  AND (
    role <> 'owner'::workspace_role
    OR has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role])
    OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS wm_update_admins ON public.workspace_members;
CREATE POLICY wm_update_admins
ON public.workspace_members FOR UPDATE TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
WITH CHECK (
  has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  AND (
    role <> 'owner'::workspace_role
    OR has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role])
  )
);

-- 4) Revoke EXECUTE on SECURITY DEFINER helpers from API roles.
--    RLS policies and triggers run as table/postgres owner and still work.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, workspace_role[]) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_task(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) FROM anon, authenticated, public;
