
-- 1. currency_rates: use app_private.* helpers
DROP POLICY IF EXISTS currency_rates_delete_admins ON public.currency_rates;
DROP POLICY IF EXISTS currency_rates_select_members ON public.currency_rates;
DROP POLICY IF EXISTS currency_rates_update_admins ON public.currency_rates;
DROP POLICY IF EXISTS currency_rates_write_admins ON public.currency_rates;

CREATE POLICY currency_rates_select_members ON public.currency_rates
  FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY currency_rates_write_admins ON public.currency_rates
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE POLICY currency_rates_update_admins ON public.currency_rates
  FOR UPDATE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE POLICY currency_rates_delete_admins ON public.currency_rates
  FOR DELETE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

-- 2. role_templates: use app_private.* helpers
DROP POLICY IF EXISTS "members can read templates" ON public.role_templates;
DROP POLICY IF EXISTS "owners/admins can write templates" ON public.role_templates;

CREATE POLICY "members can read templates" ON public.role_templates
  FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "owners/admins can write templates" ON public.role_templates
  FOR ALL TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

-- 3. time_entries: require task access on update/delete
DROP POLICY IF EXISTS time_entries_delete_own ON public.time_entries;
DROP POLICY IF EXISTS time_entries_update_own ON public.time_entries;

CREATE POLICY time_entries_update_own ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()));

CREATE POLICY time_entries_delete_own ON public.time_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()));

-- 4. Revoke EXECUTE on public-schema security definer helpers that have app_private equivalents
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_task(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, workspace_role[]) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) FROM anon, authenticated, PUBLIC;

-- Trigger / internal-only security definer functions: not meant to be RPC-called
REVOKE EXECUTE ON FUNCTION public.accept_pending_invitations() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_workspace() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_workspace_templates() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_task_activity() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_time_entry_activity() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_workspace_role_templates(uuid) FROM anon, authenticated, PUBLIC;
