
-- Impedir due_date/end_date anterior a start_date en tasks, sprints y phases

CREATE OR REPLACE FUNCTION public.tg_validate_task_working_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid;
  v_check_due boolean := false;
  v_check_start boolean := false;
BEGIN
  IF current_setting('app.skip_working_day_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Validación básica: due_date no puede ser anterior a start_date
  IF NEW.start_date IS NOT NULL AND NEW.due_date IS NOT NULL
     AND NEW.due_date < NEW.start_date THEN
    RAISE EXCEPTION 'La fecha de término (%) no puede ser anterior a la fecha de inicio (%).',
      to_char(NEW.due_date, 'DD-MM-YYYY'),
      to_char(NEW.start_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bypass para tareas importadas (Wrike, legacy). Fechas provienen del sistema origen.
  IF NEW.external_ref IS NOT NULL
     AND (NEW.external_ref LIKE 'wrike:%' OR NEW.external_ref LIKE 'legacy:%') THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_check_due := NEW.due_date IS NOT NULL;
    v_check_start := NEW.start_date IS NOT NULL;
  ELSE
    v_check_due := NEW.due_date IS NOT NULL
      AND (NEW.due_date IS DISTINCT FROM OLD.due_date
           OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id);
    v_check_start := NEW.start_date IS NOT NULL
      AND (NEW.start_date IS DISTINCT FROM OLD.start_date
           OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id);
  END IF;

  IF NOT v_check_due AND NOT v_check_start THEN
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO v_ws FROM public.projects WHERE id = NEW.project_id;
  IF v_ws IS NULL THEN RETURN NEW; END IF;

  IF v_check_due
     AND public.is_non_working_day(v_ws, NEW.assignee_id, NEW.due_date) THEN
    RAISE EXCEPTION 'No se puede agendar la tarea con vencimiento % (fin de semana, feriado o día libre del usuario asignado).',
      to_char(NEW.due_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_check_start
     AND public.is_non_working_day(v_ws, NEW.assignee_id, NEW.start_date) THEN
    RAISE EXCEPTION 'No se puede iniciar la tarea el % (fin de semana, feriado o día libre del usuario asignado).',
      to_char(NEW.start_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
