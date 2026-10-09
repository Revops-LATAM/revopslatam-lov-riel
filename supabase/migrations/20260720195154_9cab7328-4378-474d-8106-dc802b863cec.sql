CREATE OR REPLACE FUNCTION public.update_phase_raw(
  _id uuid,
  _name text,
  _start_date date,
  _end_date date,
  _order_index integer
)
RETURNS public.phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.phases;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  UPDATE public.phases
  SET name = COALESCE(_name, name),
      start_date = _start_date,
      end_date = _end_date,
      order_index = COALESCE(_order_index, order_index)
  WHERE id = _id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_phase_raw(uuid, text, date, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_phase_raw(uuid, text, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_phase_raw(uuid, text, date, date, integer) TO service_role;