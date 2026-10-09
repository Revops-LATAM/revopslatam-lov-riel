
-- 1) contract_payments: restrict writes to owner/admin/super_admin or finance_manage
DROP POLICY IF EXISTS payments_write ON public.contract_payments;
CREATE POLICY payments_write ON public.contract_payments
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_payments.contract_id
      AND (
        app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_payments.contract_id
      AND (
        app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission)
      )
  ));

-- 2) contract_service_milestones: standardize (recreate identical shape to csl_write; addresses drift finding by pairing with payments/sprints updates)
DROP POLICY IF EXISTS csm_write ON public.contract_service_milestones;
CREATE POLICY csm_write ON public.contract_service_milestones
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND (
        app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND (
        app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
        OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission)
      )
  ));

-- 3) marketing-assets storage: require workspace membership by first path segment (paths are `${workspaceId}/${pieceId}/...`)
DROP POLICY IF EXISTS marketing_assets_auth_read ON storage.objects;
DROP POLICY IF EXISTS marketing_assets_auth_insert ON storage.objects;
DROP POLICY IF EXISTS marketing_assets_auth_update ON storage.objects;
DROP POLICY IF EXISTS marketing_assets_auth_delete ON storage.objects;

CREATE POLICY marketing_assets_member_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND app_private.is_workspace_member(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY marketing_assets_member_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-assets'
    AND app_private.is_workspace_member(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY marketing_assets_member_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND app_private.is_workspace_member(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid,
      auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'marketing-assets'
    AND app_private.is_workspace_member(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY marketing_assets_member_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND app_private.is_workspace_member(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid,
      auth.uid()
    )
  );
