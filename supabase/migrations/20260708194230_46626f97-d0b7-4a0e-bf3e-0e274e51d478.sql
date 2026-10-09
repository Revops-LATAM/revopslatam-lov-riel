-- Admins/owners del workspace pueden saltarse la regla de backlog recurrente
CREATE OR REPLACE FUNCTION public.enforce_backlog_task_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  ctype public.contract_type;
  cat public.task_status_category;
  wsid uuid;
  is_admin boolean := false;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
  IF ctype <> 'recurrente' THEN
    RETURN NEW;
  END IF;

  IF NEW.sprint_id IS NULL AND NEW.status_id IS NOT NULL THEN
    SELECT category INTO cat FROM public.task_statuses WHERE id = NEW.status_id;
    IF cat NOT IN ('abierta','cancelada') THEN
      -- Permitir a owners/admins del workspace saltarse la regla
      SELECT p.workspace_id INTO wsid FROM public.projects p WHERE p.id = NEW.project_id;
      IF wsid IS NOT NULL AND auth.uid() IS NOT NULL THEN
        SELECT app_private.has_workspace_role(wsid, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
          INTO is_admin;
      END IF;
      IF NOT is_admin THEN
        RAISE EXCEPTION 'No se puede cambiar el estado de una tarea del backlog: asígnala a un sprint primero.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;