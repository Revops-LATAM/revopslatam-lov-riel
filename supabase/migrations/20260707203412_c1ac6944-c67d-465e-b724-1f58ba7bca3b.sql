DROP POLICY IF EXISTS ctae_write ON public.client_ticket_authorized_emails;
CREATE POLICY ctae_write ON public.client_ticket_authorized_emails
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_ticket_forms f
    WHERE f.id = client_ticket_authorized_emails.form_id
      AND public.has_workspace_role(f.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_ticket_forms f
    WHERE f.id = client_ticket_authorized_emails.form_id
      AND public.has_workspace_role(f.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
  ));