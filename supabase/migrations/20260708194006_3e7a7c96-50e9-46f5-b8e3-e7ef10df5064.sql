-- 1) enforce_backlog_task_status: fallar con error visible en vez de revertir silencioso
CREATE OR REPLACE FUNCTION public.enforce_backlog_task_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  ctype public.contract_type;
  cat public.task_status_category;
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
      RAISE EXCEPTION 'No se puede cambiar el estado de una tarea del backlog: asígnala a un sprint primero.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) trg_tasks_recompute_estimate: al editar el total, borrar overrides manuales
--    y dejar que recompute reparta parejo con el nuevo total.
CREATE OR REPLACE FUNCTION public.tg_tasks_recompute_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.total_effort_hours IS DISTINCT FROM OLD.total_effort_hours THEN
    -- Editar el total es autoritativo: borra overrides manuales por persona
    UPDATE public.task_estimates
       SET manual = false
     WHERE task_id = NEW.id AND manual = true;
    PERFORM public.recompute_task_estimate_split(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;