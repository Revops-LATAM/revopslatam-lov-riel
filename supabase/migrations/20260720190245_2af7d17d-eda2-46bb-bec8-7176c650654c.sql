CREATE OR REPLACE FUNCTION public.insert_phase_raw(
  _project_id uuid,
  _name text,
  _order_index int,
  _start_date date,
  _end_date date
) RETURNS public.phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.phases;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  INSERT INTO public.phases (project_id, name, order_index, start_date, end_date)
  VALUES (_project_id, _name, _order_index, _start_date, _end_date)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_phase_raw(uuid, text, int, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.insert_phase_raw(uuid, text, int, date, date) TO authenticated, service_role;