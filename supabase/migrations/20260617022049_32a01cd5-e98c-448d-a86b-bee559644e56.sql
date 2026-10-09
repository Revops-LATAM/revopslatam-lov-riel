
ALTER TABLE public.sprints ALTER COLUMN status SET DEFAULT 'por_planificar'::public.sprint_status;

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
