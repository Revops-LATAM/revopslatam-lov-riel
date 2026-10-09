
-- 1. Enum for sprint cadence (only mensual or quincenal)
DO $$ BEGIN
  CREATE TYPE public.sprint_cadence AS ENUM ('monthly', 'biweekly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add cadence + hours per sprint to contracts (used when type = 'recurrente')
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS sprint_cadence public.sprint_cadence,
  ADD COLUMN IF NOT EXISTS hours_per_sprint numeric(8,2);

-- 3. Add first sprint start date to projects (set from Operaciones in delivery wizard)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS first_sprint_start_date date;

-- 4. Helper: generate sprints from contract using cadence + first start date
CREATE OR REPLACE FUNCTION public.generate_contract_sprints_from_cadence(
  _contract_id uuid,
  _first_start date
) RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
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

  -- Remove planned (not started) sprints to avoid duplicates
  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'planned';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE contract_id = _contract_id;

  cur_start := COALESCE(_first_start, c.start_date);
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST(((cur_start + step_interval)::date - 1), end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, next_n, cur_start, cur_end, COALESCE(c.hours_per_sprint, 0), 'planned');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$fn$;
