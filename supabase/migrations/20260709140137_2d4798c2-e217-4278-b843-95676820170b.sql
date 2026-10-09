CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND public.has_workspace_role(
        p.workspace_id, _user_id,
        ARRAY['owner','admin','member','super_admin']::public.workspace_role[]
      )
  )
$function$;

CREATE OR REPLACE FUNCTION app_private.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND app_private.has_workspace_role(
        p.workspace_id, _user_id,
        ARRAY['owner','admin','member','super_admin']::public.workspace_role[]
      )
  )
$function$;