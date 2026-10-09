
-- 1) Create app_private.has_permission mirroring public.has_permission
CREATE OR REPLACE FUNCTION app_private.has_permission(_workspace_id uuid, _user_id uuid, _perm public.workspace_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    LEFT JOIN public.role_templates rt ON rt.id = wm.role_template_id
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _user_id
      AND (
        wm.role IN ('owner','admin','super_admin')
        OR _perm = ANY(COALESCE(rt.permissions, ARRAY[]::public.workspace_permission[]))
        OR _perm = ANY(wm.extra_permissions)
      )
  )
$$;

REVOKE ALL ON FUNCTION app_private.has_permission(uuid, uuid, public.workspace_permission) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_permission(uuid, uuid, public.workspace_permission) TO authenticated;

-- 2) Tighten comments/attachments policies: also require current task access
DROP POLICY IF EXISTS comments_update_own ON public.task_comments;
CREATE POLICY comments_update_own ON public.task_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()))
  WITH CHECK (author_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()));

DROP POLICY IF EXISTS comments_delete_own ON public.task_comments;
CREATE POLICY comments_delete_own ON public.task_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()));

DROP POLICY IF EXISTS attachments_delete_own ON public.task_attachments;
CREATE POLICY attachments_delete_own ON public.task_attachments
  FOR DELETE TO authenticated
  USING (uploader_id = auth.uid() AND app_private.can_access_task(task_id, auth.uid()));

-- 3) Recreate listed policies with fully-qualified app_private.* calls

-- service_types
DROP POLICY IF EXISTS service_types_select ON public.service_types;
CREATE POLICY service_types_select ON public.service_types
  FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS service_types_write ON public.service_types;
CREATE POLICY service_types_write ON public.service_types
  FOR ALL TO authenticated
  USING (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR app_private.has_permission(workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission)
  )
  WITH CHECK (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR app_private.has_permission(workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission)
  );

-- project_service_lines
DROP POLICY IF EXISTS psl_select ON public.project_service_lines;
CREATE POLICY psl_select ON public.project_service_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_service_lines.project_id
      AND app_private.is_workspace_member(p.workspace_id, auth.uid())
  ));

DROP POLICY IF EXISTS psl_write ON public.project_service_lines;
CREATE POLICY psl_write ON public.project_service_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_service_lines.project_id
      AND (app_private.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_service_lines.project_id
      AND (app_private.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))
  ));

-- contract_service_lines
DROP POLICY IF EXISTS csl_select ON public.contract_service_lines;
CREATE POLICY csl_select ON public.contract_service_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_service_lines.contract_id
      AND app_private.is_workspace_member(c.workspace_id, auth.uid())
  ));

DROP POLICY IF EXISTS csl_write ON public.contract_service_lines;
CREATE POLICY csl_write ON public.contract_service_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_service_lines.contract_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_service_lines.contract_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  ));

-- project_hour_budget
DROP POLICY IF EXISTS phb_select ON public.project_hour_budget;
CREATE POLICY phb_select ON public.project_hour_budget
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_hour_budget.project_id
      AND app_private.is_workspace_member(p.workspace_id, auth.uid())
  ));

DROP POLICY IF EXISTS phb_write ON public.project_hour_budget;
CREATE POLICY phb_write ON public.project_hour_budget
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_hour_budget.project_id
      AND (app_private.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_hour_budget.project_id
      AND (app_private.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))
  ));

-- milestone_hito_links
DROP POLICY IF EXISTS mhl_select ON public.milestone_hito_links;
CREATE POLICY mhl_select ON public.milestone_hito_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.contract_payments cp
    JOIN public.contracts c ON c.id = cp.contract_id
    WHERE cp.id = milestone_hito_links.payment_id
      AND app_private.is_workspace_member(c.workspace_id, auth.uid())
  ));

DROP POLICY IF EXISTS mhl_write ON public.milestone_hito_links;
CREATE POLICY mhl_write ON public.milestone_hito_links
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.contract_payments cp
    JOIN public.contracts c ON c.id = cp.contract_id
    WHERE cp.id = milestone_hito_links.payment_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.contract_payments cp
    JOIN public.contracts c ON c.id = cp.contract_id
    WHERE cp.id = milestone_hito_links.payment_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  ));

-- contract_handoffs
DROP POLICY IF EXISTS handoff_select ON public.contract_handoffs;
CREATE POLICY handoff_select ON public.contract_handoffs
  FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS handoff_write ON public.contract_handoffs;
CREATE POLICY handoff_write ON public.contract_handoffs
  FOR ALL TO authenticated
  USING (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR app_private.has_permission(workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission)
  )
  WITH CHECK (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR app_private.has_permission(workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission)
  );

-- member_cost_rates
DROP POLICY IF EXISTS mcr_select ON public.member_cost_rates;
CREATE POLICY mcr_select ON public.member_cost_rates
  FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS mcr_write ON public.member_cost_rates;
CREATE POLICY mcr_write ON public.member_cost_rates
  FOR ALL TO authenticated
  USING (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR app_private.has_permission(workspace_id, auth.uid(), 'admin_capacity'::public.workspace_permission)
  )
  WITH CHECK (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR app_private.has_permission(workspace_id, auth.uid(), 'admin_capacity'::public.workspace_permission)
  );

-- contract_service_milestones
DROP POLICY IF EXISTS csm_select ON public.contract_service_milestones;
CREATE POLICY csm_select ON public.contract_service_milestones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND app_private.is_workspace_member(c.workspace_id, auth.uid())
  ));

DROP POLICY IF EXISTS csm_write ON public.contract_service_milestones;
CREATE POLICY csm_write ON public.contract_service_milestones
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  ));
