REVOKE SELECT (token_sii) ON public.invoices FROM authenticated;
REVOKE SELECT (token_sii) ON public.invoices FROM anon;

CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));