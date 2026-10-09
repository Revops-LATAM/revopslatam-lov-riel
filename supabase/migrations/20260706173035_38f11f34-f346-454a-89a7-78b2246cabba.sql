
DROP POLICY IF EXISTS csm_write ON public.contract_service_milestones;
CREATE POLICY csm_write ON public.contract_service_milestones
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
           OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contract_service_lines sl
    JOIN public.contracts c ON c.id = sl.contract_id
    WHERE sl.id = contract_service_milestones.service_line_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
           OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission))
  ));

DROP POLICY IF EXISTS payments_write ON public.contract_payments;
CREATE POLICY payments_write ON public.contract_payments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_payments.contract_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
           OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_payments.contract_id
      AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'super_admin'::workspace_role])
           OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::workspace_permission))
  ));
