
-- 1) Hide invoices.token_sii from client roles
REVOKE SELECT (token_sii) ON public.invoices FROM authenticated;
REVOKE SELECT (token_sii) ON public.invoices FROM anon;

-- 2) Hide OAuth tokens from client roles
REVOKE SELECT (access_token, refresh_token, sync_token) ON public.user_calendar_connections FROM authenticated;
REVOKE SELECT (access_token, refresh_token, sync_token) ON public.user_calendar_connections FROM anon;

-- 3) Hide DTE provider api_key from client roles
REVOKE SELECT (api_key) ON public.workspace_dte_config FROM authenticated;
REVOKE SELECT (api_key) ON public.workspace_dte_config FROM anon;

-- 4) Restrict workspace_emisor SELECT to admins/finance
DROP POLICY IF EXISTS "emisor_select_members" ON public.workspace_emisor;
CREATE POLICY "emisor_select_admin_or_finance" ON public.workspace_emisor
  FOR SELECT TO authenticated
  USING (
    public.has_workspace_role(workspace_id, auth.uid(),
      ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR public.has_permission(workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_view'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
  );

-- 5) Scope calendar_recurring_classifications writes to the owning user
DROP POLICY IF EXISTS "Workspace members write recurring classifications" ON public.calendar_recurring_classifications;
CREATE POLICY "Owner writes recurring classifications" ON public.calendar_recurring_classifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
