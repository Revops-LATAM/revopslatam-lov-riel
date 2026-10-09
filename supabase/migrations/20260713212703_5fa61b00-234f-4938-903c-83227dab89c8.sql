CREATE OR REPLACE FUNCTION public.regenerate_sprint_dates(_contract_id uuid, _first_start date, _sprint_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  sd date;
  ed date;
  n int := 0;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  FOR r IN SELECT id, sprint_number FROM public.sprints WHERE contract_id = _contract_id ORDER BY sprint_number LOOP
    sd := _first_start + ((r.sprint_number - 1) * _sprint_days);
    ed := _first_start + (r.sprint_number * _sprint_days - 1);
    UPDATE public.sprints SET start_date = sd, end_date = ed WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_sprint_dates(uuid, date, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.insert_sprints_bulk(_contract_id uuid, _first_start date, _sprint_days integer, _from_number integer, _to_number integer, _hours numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
  sd date;
  ed date;
  cnt int := 0;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  FOR i IN _from_number.._to_number LOOP
    sd := _first_start + ((i - 1) * _sprint_days);
    ed := _first_start + (i * _sprint_days - 1);
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, i, sd, ed, COALESCE(_hours, 0), 'por_planificar');
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_sprints_bulk(uuid, date, integer, integer, integer, numeric) TO authenticated, service_role;