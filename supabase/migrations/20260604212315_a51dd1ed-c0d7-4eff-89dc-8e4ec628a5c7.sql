
ALTER TABLE public.workspace_invitations
  ADD COLUMN IF NOT EXISTS role_template_id uuid REFERENCES public.role_templates(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role, role_template_id)
  SELECT i.workspace_id, NEW.id, i.role, i.role_template_id
  FROM public.workspace_invitations i
  WHERE lower(i.email) = lower(NEW.email)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.workspace_invitations
  WHERE lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$function$;
