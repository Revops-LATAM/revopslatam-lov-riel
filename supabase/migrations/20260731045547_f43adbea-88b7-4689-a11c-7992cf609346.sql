CREATE OR REPLACE FUNCTION public.upsert_sprint_raw(
  _contract_id uuid,
  _sprint_number int,
  _start_date date,
  _end_date date,
  _contracted_hours numeric,
  _notes text,
  _project_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);

  IF _project_id IS NULL THEN
    SELECT id INTO _id FROM public.sprints
     WHERE contract_id = _contract_id AND sprint_number = _sprint_number
     LIMIT 1;
  ELSE
    SELECT id INTO _id FROM public.sprints
     WHERE contract_id = _contract_id
       AND sprint_number = _sprint_number
       AND project_id = _project_id
     LIMIT 1;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.sprints(contract_id, project_id, sprint_number, start_date, end_date, contracted_hours, status, notes)
    VALUES (_contract_id, _project_id, _sprint_number, _start_date, _end_date, COALESCE(_contracted_hours,0), 'por_planificar', _notes)
    RETURNING id INTO _id;
  ELSE
    UPDATE public.sprints
       SET start_date = _start_date,
           end_date = _end_date,
           contracted_hours = COALESCE(_contracted_hours, 0),
           notes = COALESCE(_notes, notes)
     WHERE id = _id;
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_sprint_raw(uuid,int,date,date,numeric,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_sprint_raw(uuid,int,date,date,numeric,text,uuid) TO service_role, authenticated;