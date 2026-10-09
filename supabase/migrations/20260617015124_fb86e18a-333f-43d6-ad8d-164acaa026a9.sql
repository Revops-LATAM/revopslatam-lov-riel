
-- ============ TASK STATUS ============
ALTER TYPE public.task_status RENAME VALUE 'backlog' TO 'nueva';
ALTER TYPE public.task_status RENAME VALUE 'todo' TO 'planificada';
ALTER TYPE public.task_status RENAME VALUE 'in_progress' TO 'en_curso';
ALTER TYPE public.task_status RENAME VALUE 'in_review' TO 'revision_interna';
ALTER TYPE public.task_status RENAME VALUE 'done' TO 'completada';
ALTER TYPE public.task_status RENAME VALUE 'cancelled' TO 'cancelada';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'en_pausa';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'revision_cliente';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'en_correccion';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'demorada';

ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'planificada'::public.task_status;

-- ============ SPRINT STATUS ============
ALTER TYPE public.sprint_status RENAME VALUE 'planned' TO 'planificado';
ALTER TYPE public.sprint_status RENAME VALUE 'active' TO 'en_curso';
ALTER TYPE public.sprint_status RENAME VALUE 'closed' TO 'cerrado';
ALTER TYPE public.sprint_status ADD VALUE IF NOT EXISTS 'por_planificar';

ALTER TABLE public.sprints ALTER COLUMN status SET DEFAULT 'planificado'::public.sprint_status;

-- ============ PHASE STATUS ============
ALTER TYPE public.phase_status RENAME VALUE 'planned' TO 'sin_iniciar';
ALTER TYPE public.phase_status RENAME VALUE 'in_progress' TO 'en_curso';
ALTER TYPE public.phase_status RENAME VALUE 'done' TO 'completada';
ALTER TYPE public.phase_status ADD VALUE IF NOT EXISTS 'demorada';

ALTER TABLE public.phases ALTER COLUMN status SET DEFAULT 'sin_iniciar'::public.phase_status;

-- ============ CONTRACT STATUS ============
ALTER TYPE public.contract_status RENAME VALUE 'draft' TO 'borrador';
ALTER TYPE public.contract_status RENAME VALUE 'active' TO 'activo';
ALTER TYPE public.contract_status RENAME VALUE 'completed' TO 'finalizado';
ALTER TYPE public.contract_status RENAME VALUE 'cancelled' TO 'cancelado';
ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'en_renovacion';

-- Migrar datos de estados eliminados
UPDATE public.contracts SET status = 'activo'::public.contract_status WHERE status::text IN ('proyectado','paused');

ALTER TABLE public.contracts ALTER COLUMN status SET DEFAULT 'borrador'::public.contract_status;

-- ============ ACTUALIZAR FUNCIONES INTERNAS ============

CREATE OR REPLACE FUNCTION public.handle_task_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completada' AND (OLD.status IS DISTINCT FROM 'completada') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completada' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_contract_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'activo'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'activo')
     AND NEW.contrato_padre_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.contract_handoffs WHERE contract_id = NEW.id) THEN
    INSERT INTO public.contract_handoffs (contract_id, workspace_id, state)
    VALUES (NEW.id, NEW.workspace_id, 'pendiente');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_contract_renewal_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status = 'activo'
     AND NEW.puede_renovarse = true
     AND NEW.end_date IS NOT NULL
     AND NEW.fecha_aviso_renovacion IS NULL THEN
    NEW.fecha_aviso_renovacion := NEW.end_date - COALESCE(NEW.anticipacion_renovacion_dias, 60);
  END IF;
  RETURN NEW;
END;
$function$;

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
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF c.sprint_cadence IS NULL THEN RETURN 0; END IF;

  step_interval := CASE c.sprint_cadence
    WHEN 'monthly' THEN INTERVAL '1 month'
    WHEN 'biweekly' THEN INTERVAL '15 days'
  END;

  end_d := COALESCE(c.end_date, (COALESCE(_first_start, c.start_date) + interval '12 months')::date);

  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'planificado';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE contract_id = _contract_id;

  cur_start := COALESCE(_first_start, c.start_date);
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST(((cur_start + step_interval)::date - 1), end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, next_n, cur_start, cur_end, COALESCE(c.hours_per_sprint, 0), 'planificado');
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
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF _sprint_days IS NULL OR _sprint_days <= 0 THEN RETURN 0; END IF;

  end_d := COALESCE(c.end_date, (c.start_date + interval '12 months')::date);

  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'planificado';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE contract_id = _contract_id;

  cur_start := c.start_date;
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST((cur_start + (_sprint_days - 1) * INTERVAL '1 day')::date, end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, next_n, cur_start, cur_end, COALESCE(_hours_per_sprint, 0), 'planificado');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$function$;
