-- 1) Índice único idempotente (para poder re-sembrar feriados sin duplicar)
CREATE UNIQUE INDEX IF NOT EXISTS workspace_holidays_uniq
  ON public.workspace_holidays (workspace_id, date, affects, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 2) Función helper: ¿es día no laboral para este workspace/usuario?
CREATE OR REPLACE FUNCTION public.is_non_working_day(_workspace_id uuid, _user_id uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Sábado (6) o domingo (7) en ISO
    EXTRACT(ISODOW FROM _date)::int IN (6, 7)
    OR EXISTS (
      SELECT 1
      FROM public.workspace_holidays h
      WHERE h.workspace_id = _workspace_id
        AND h.date = _date
        AND (
          h.affects = 'all'
          OR (h.affects = 'user' AND _user_id IS NOT NULL AND h.user_id = _user_id)
        )
    );
$$;

-- 3) Trigger de validación para tareas (start_date, due_date contra assignee)
CREATE OR REPLACE FUNCTION public.tg_validate_task_working_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
BEGIN
  -- Bypass explícito (para procesos como generadores automáticos)
  IF current_setting('app.skip_working_day_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
  SELECT workspace_id INTO v_ws FROM public.projects WHERE id = NEW.project_id;
  IF v_ws IS NULL THEN RETURN NEW; END IF;

  IF NEW.due_date IS NOT NULL
     AND public.is_non_working_day(v_ws, NEW.assignee_id, NEW.due_date) THEN
    RAISE EXCEPTION 'No se puede agendar la tarea con vencimiento % (fin de semana, feriado o día libre del usuario asignado).',
      to_char(NEW.due_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.start_date IS NOT NULL
     AND public.is_non_working_day(v_ws, NEW.assignee_id, NEW.start_date) THEN
    RAISE EXCEPTION 'No se puede iniciar la tarea el % (fin de semana, feriado o día libre del usuario asignado).',
      to_char(NEW.start_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tasks_validate_working_dates ON public.tasks;
CREATE TRIGGER tg_tasks_validate_working_dates
  BEFORE INSERT OR UPDATE OF start_date, due_date, assignee_id, project_id
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_validate_task_working_dates();

-- 4) Trigger de validación para fases
CREATE OR REPLACE FUNCTION public.tg_validate_phase_working_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
BEGIN
  IF current_setting('app.skip_working_day_check', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
  SELECT workspace_id INTO v_ws FROM public.projects WHERE id = NEW.project_id;
  IF v_ws IS NULL THEN RETURN NEW; END IF;

  IF NEW.start_date IS NOT NULL
     AND public.is_non_working_day(v_ws, NULL, NEW.start_date) THEN
    RAISE EXCEPTION 'No se puede iniciar la fase el % (fin de semana o feriado).',
      to_char(NEW.start_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.end_date IS NOT NULL
     AND public.is_non_working_day(v_ws, NULL, NEW.end_date) THEN
    RAISE EXCEPTION 'No se puede terminar la fase el % (fin de semana o feriado).',
      to_char(NEW.end_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_phases_validate_working_dates ON public.phases;
CREATE TRIGGER tg_phases_validate_working_dates
  BEFORE INSERT OR UPDATE OF start_date, end_date, project_id
  ON public.phases
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_validate_phase_working_dates();

-- 5) Trigger de validación para sprints
CREATE OR REPLACE FUNCTION public.tg_validate_sprint_working_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
BEGIN
  IF current_setting('app.skip_working_day_check', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.contract_id IS NULL THEN RETURN NEW; END IF;
  SELECT workspace_id INTO v_ws FROM public.contracts WHERE id = NEW.contract_id;
  IF v_ws IS NULL THEN RETURN NEW; END IF;

  IF NEW.start_date IS NOT NULL
     AND public.is_non_working_day(v_ws, NULL, NEW.start_date) THEN
    RAISE EXCEPTION 'No se puede iniciar el sprint el % (fin de semana o feriado).',
      to_char(NEW.start_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.end_date IS NOT NULL
     AND public.is_non_working_day(v_ws, NULL, NEW.end_date) THEN
    RAISE EXCEPTION 'No se puede terminar el sprint el % (fin de semana o feriado).',
      to_char(NEW.end_date, 'DD-MM-YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sprints_validate_working_dates ON public.sprints;
CREATE TRIGGER tg_sprints_validate_working_dates
  BEFORE INSERT OR UPDATE OF start_date, end_date, contract_id
  ON public.sprints
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_validate_sprint_working_dates();

-- 6) Los generadores automáticos de sprint deben saltarse la validación
CREATE OR REPLACE FUNCTION public.generate_contract_sprints_from_cadence(_contract_id uuid, _first_start date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  cur_start date;
  cur_end date;
  end_d date;
  next_n int;
  created_count int := 0;
  step_interval interval;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF c.sprint_cadence IS NULL THEN RETURN 0; END IF;

  step_interval := CASE c.sprint_cadence
    WHEN 'monthly' THEN INTERVAL '1 month'
    WHEN 'biweekly' THEN INTERVAL '15 days'
  END;

  end_d := COALESCE(c.end_date, (COALESCE(_first_start, c.start_date) + interval '12 months')::date);

  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'por_planificar';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE contract_id = _contract_id;

  cur_start := COALESCE(_first_start, c.start_date);
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST(((cur_start + step_interval)::date - 1), end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, next_n, cur_start, cur_end, COALESCE(c.hours_per_sprint, 0), 'por_planificar');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_contract_sprints(_contract_id uuid, _sprint_days integer, _hours_per_sprint numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  cur_start date;
  cur_end date;
  end_d date;
  next_n int;
  created_count int := 0;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF _sprint_days IS NULL OR _sprint_days <= 0 THEN RETURN 0; END IF;

  end_d := COALESCE(c.end_date, (c.start_date + interval '12 months')::date);

  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'por_planificar';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE contract_id = _contract_id;

  cur_start := c.start_date;
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST((cur_start + (_sprint_days - 1) * INTERVAL '1 day')::date, end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, next_n, cur_start, cur_end, COALESCE(_hours_per_sprint, 0), 'por_planificar');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$function$;

-- 7) Sembrar feriados oficiales de Chile 2026 y 2027 en todos los workspaces existentes
DO $seed$
DECLARE
  ws record;
  h record;
BEGIN
  FOR ws IN SELECT id FROM public.workspaces LOOP
    FOR h IN
      SELECT * FROM (VALUES
        ('2026-01-01'::date, 'Año Nuevo'),
        ('2026-04-03'::date, 'Viernes Santo'),
        ('2026-04-04'::date, 'Sábado Santo'),
        ('2026-05-01'::date, 'Día del Trabajador'),
        ('2026-05-21'::date, 'Día de las Glorias Navales'),
        ('2026-06-21'::date, 'Día Nacional de los Pueblos Indígenas'),
        ('2026-06-29'::date, 'San Pedro y San Pablo'),
        ('2026-07-16'::date, 'Virgen del Carmen'),
        ('2026-08-15'::date, 'Asunción de la Virgen'),
        ('2026-09-18'::date, 'Independencia Nacional'),
        ('2026-09-19'::date, 'Día de las Glorias del Ejército'),
        ('2026-10-12'::date, 'Encuentro de Dos Mundos'),
        ('2026-10-31'::date, 'Día de las Iglesias Evangélicas'),
        ('2026-11-01'::date, 'Día de Todos los Santos'),
        ('2026-12-08'::date, 'Inmaculada Concepción'),
        ('2026-12-25'::date, 'Navidad'),
        ('2027-01-01'::date, 'Año Nuevo'),
        ('2027-03-26'::date, 'Viernes Santo'),
        ('2027-03-27'::date, 'Sábado Santo'),
        ('2027-05-01'::date, 'Día del Trabajador'),
        ('2027-05-21'::date, 'Día de las Glorias Navales'),
        ('2027-06-21'::date, 'Día Nacional de los Pueblos Indígenas'),
        ('2027-06-28'::date, 'San Pedro y San Pablo'),
        ('2027-07-16'::date, 'Virgen del Carmen'),
        ('2027-08-15'::date, 'Asunción de la Virgen'),
        ('2027-09-18'::date, 'Independencia Nacional'),
        ('2027-10-11'::date, 'Encuentro de Dos Mundos'),
        ('2027-10-31'::date, 'Día de las Iglesias Evangélicas'),
        ('2027-11-01'::date, 'Día de Todos los Santos'),
        ('2027-12-08'::date, 'Inmaculada Concepción'),
        ('2027-12-25'::date, 'Navidad')
      ) AS t(d, n)
    LOOP
      INSERT INTO public.workspace_holidays (workspace_id, date, name, affects, user_id)
      VALUES (ws.id, h.d, h.n, 'all', NULL)
      ON CONFLICT (workspace_id, date, affects, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
    END LOOP;
  END LOOP;
END
$seed$;

-- 8) Permisos para la función helper (SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.is_non_working_day(uuid, uuid, date) TO authenticated, service_role;
