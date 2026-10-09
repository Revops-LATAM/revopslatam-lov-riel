
-- 1) Email queue functions: pin search_path
CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$ BEGIN RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN RETURN FALSE; END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$ BEGIN RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN PERFORM pgmq.create(queue_name); RETURN pgmq.send(queue_name, payload); END; $$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$ DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$ BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN PERFORM pgmq.create(queue_name); RETURN; END; $$;

-- 2) Commissions: scope policies to authenticated only
DROP POLICY IF EXISTS commissions_modify_managers ON public.commissions;
DROP POLICY IF EXISTS commissions_select_workspace_members ON public.commissions;

CREATE POLICY commissions_select_workspace_members ON public.commissions
FOR SELECT TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.has_permission(workspace_id, auth.uid(), 'finance_view'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_commission_manage'::public.workspace_permission)
  )
);

CREATE POLICY commissions_modify_managers ON public.commissions
FOR ALL TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_commission_manage'::public.workspace_permission)
  )
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_commission_manage'::public.workspace_permission)
  )
);

-- 3) member_cost_rates: restrict SELECT to admins / admin_capacity
DROP POLICY IF EXISTS mcr_select ON public.member_cost_rates;
CREATE POLICY mcr_select ON public.member_cost_rates
FOR SELECT TO authenticated
USING (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
  OR public.has_permission(workspace_id, auth.uid(), 'admin_capacity'::public.workspace_permission)
);

-- 4) workspace_dte_config: restrict SELECT to admins / finance_manage (api_key contains a provider secret)
DROP POLICY IF EXISTS "dte_config select" ON public.workspace_dte_config;
CREATE POLICY "dte_config select" ON public.workspace_dte_config
FOR SELECT TO authenticated
USING (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
  OR public.has_permission(workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission)
  OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
);

-- 5) storage.objects: explicit UPDATE policy on task-attachments
DROP POLICY IF EXISTS attachments_storage_update ON storage.objects;
CREATE POLICY attachments_storage_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND app_private.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'task-attachments'
  AND app_private.can_access_task(((storage.foldername(name))[1])::uuid, auth.uid())
);
