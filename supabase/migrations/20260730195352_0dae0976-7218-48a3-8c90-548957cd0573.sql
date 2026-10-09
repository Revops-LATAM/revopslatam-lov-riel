-- 1) projects: capa de contenedor bajo el contrato
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_per_sprint numeric;

-- Backfill: el proyecto existente de cada contrato queda como principal
WITH ranked AS (
  SELECT p.id,
         row_number() OVER (PARTITION BY p.contract_id ORDER BY p.created_at, p.id) AS rn
  FROM public.projects p
  WHERE p.contract_id IS NOT NULL
)
UPDATE public.projects p
   SET is_primary = true
  FROM ranked r
 WHERE p.id = r.id AND r.rn = 1;

-- Hereda horas por sprint del contrato
UPDATE public.projects p
   SET hours_per_sprint = c.hours_per_sprint
  FROM public.contracts c
 WHERE p.contract_id = c.id
   AND p.hours_per_sprint IS NULL
   AND c.hours_per_sprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS projects_contract_orden_idx
  ON public.projects (contract_id, orden);

-- 2) sprints pasan a colgar del proyecto (contract_id se conserva denormalizado)
ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

UPDATE public.sprints s
   SET project_id = p.id
  FROM public.projects p
 WHERE s.project_id IS NULL
   AND p.contract_id = s.contract_id
   AND p.is_primary = true;

-- Fallback: cualquier proyecto del contrato
UPDATE public.sprints s
   SET project_id = p.id
  FROM public.projects p
 WHERE s.project_id IS NULL
   AND p.contract_id = s.contract_id;

CREATE INDEX IF NOT EXISTS sprints_project_number_idx
  ON public.sprints (project_id, sprint_number);

-- Numeración única por proyecto en vez de por contrato
ALTER TABLE public.sprints
  DROP CONSTRAINT IF EXISTS sprints_contract_id_sprint_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS sprints_project_sprint_number_key
  ON public.sprints (project_id, sprint_number)
  WHERE project_id IS NOT NULL;

-- 3) Mantener sprints.contract_id sincronizado con el proyecto
CREATE OR REPLACE FUNCTION public.tg_sprints_sync_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_contract uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT contract_id INTO v_contract FROM public.projects WHERE id = NEW.project_id;
    IF v_contract IS NOT NULL THEN
      NEW.contract_id := v_contract;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sprints_sync_contract ON public.sprints;
CREATE TRIGGER sprints_sync_contract
  BEFORE INSERT OR UPDATE OF project_id ON public.sprints
  FOR EACH ROW EXECUTE FUNCTION public.tg_sprints_sync_contract();

-- 4) Una tarea no puede apuntar a un sprint de otro proyecto
CREATE OR REPLACE FUNCTION public.tg_tasks_validate_sprint_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sprint_project uuid;
BEGIN
  IF NEW.sprint_id IS NULL OR NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT project_id INTO v_sprint_project FROM public.sprints WHERE id = NEW.sprint_id;
  IF v_sprint_project IS NOT NULL AND v_sprint_project <> NEW.project_id THEN
    RAISE EXCEPTION 'El sprint seleccionado pertenece a otro proyecto del contrato.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_validate_sprint_project ON public.tasks;
CREATE TRIGGER tasks_validate_sprint_project
  BEFORE INSERT OR UPDATE OF sprint_id, project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_validate_sprint_project();

-- 5) Generación de sprints por proyecto (cadencia y fechas del contrato)
CREATE OR REPLACE FUNCTION public.generate_project_sprints(_project_id uuid, _first_start date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  v_contract uuid;
  v_hours numeric;
  cur_start date;
  cur_end date;
  end_d date;
  next_n int;
  created_count int := 0;
  step_interval interval;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);

  SELECT p.contract_id, COALESCE(p.hours_per_sprint, 0)
    INTO v_contract, v_hours
    FROM public.projects p WHERE p.id = _project_id;
  IF v_contract IS NULL THEN RETURN 0; END IF;

  SELECT * INTO c FROM public.contracts WHERE id = v_contract;
  IF NOT FOUND OR c.sprint_cadence IS NULL THEN RETURN 0; END IF;

  IF v_hours = 0 THEN v_hours := COALESCE(c.hours_per_sprint, 0); END IF;

  step_interval := CASE c.sprint_cadence
    WHEN 'monthly'  THEN INTERVAL '1 month'
    WHEN 'biweekly' THEN INTERVAL '15 days'
    WHEN 'weekly'   THEN INTERVAL '7 days'
  END;
  IF step_interval IS NULL THEN RETURN 0; END IF;

  cur_start := COALESCE(_first_start, c.start_date);
  end_d := COALESCE(c.end_date, (cur_start + interval '12 months')::date);

  DELETE FROM public.sprints
   WHERE project_id = _project_id AND status = 'por_planificar';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE project_id = _project_id;

  WHILE cur_start <= end_d LOOP
    cur_end := LEAST(((cur_start + step_interval)::date - 1), end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, project_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (v_contract, _project_id, next_n, cur_start, cur_end, v_hours, 'por_planificar');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_project_sprints(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_project_sprints(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_project_sprints(uuid, date) TO service_role;

-- 6) La generación legacy por contrato ahora etiqueta los sprints con el proyecto principal
CREATE OR REPLACE FUNCTION public.generate_contract_sprints_from_cadence(_contract_id uuid, _first_start date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  v_project uuid;
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

  SELECT id INTO v_project FROM public.projects
   WHERE contract_id = _contract_id
   ORDER BY is_primary DESC, orden, created_at
   LIMIT 1;

  step_interval := CASE c.sprint_cadence
    WHEN 'monthly'  THEN INTERVAL '1 month'
    WHEN 'biweekly' THEN INTERVAL '15 days'
    WHEN 'weekly'   THEN INTERVAL '7 days'
  END;
  IF step_interval IS NULL THEN RETURN 0; END IF;

  end_d := COALESCE(c.end_date, (COALESCE(_first_start, c.start_date) + interval '12 months')::date);

  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'por_planificar'
     AND (v_project IS NULL OR project_id IS NOT DISTINCT FROM v_project);

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints
   WHERE contract_id = _contract_id
     AND (v_project IS NULL OR project_id IS NOT DISTINCT FROM v_project);

  cur_start := COALESCE(_first_start, c.start_date);
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST(((cur_start + step_interval)::date - 1), end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, project_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, v_project, next_n, cur_start, cur_end, COALESCE(c.hours_per_sprint, 0), 'por_planificar');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$function$;