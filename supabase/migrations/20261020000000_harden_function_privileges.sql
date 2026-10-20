-- Riel 2.0 / Seguridad: endurecimiento de las funciones expuestas por la API (RPC).
--
-- 1) Tres funciones SECURITY DEFINER abiertas a cualquier usuario con sesión no comprobaban a quién
--    pertenece el dato que modifican (insert_phase_raw, upsert_sprint_raw x2). Se les agrega la misma
--    comprobación que ya usan insert_sprints_bulk y generate_project_sprints. Con auth.uid() nulo (llamadas
--    del servidor con la clave de servicio) no se exige, igual que en esas funciones.
-- 2) Permisos de EXECUTE: ningún rol sin sesión ejecuta funciones de la app, y las funciones de trigger
--    dejan de ser invocables por RPC (un trigger se dispara sin que nadie tenga EXECUTE sobre su función).

CREATE OR REPLACE FUNCTION public.insert_phase_raw(_project_id uuid, _name text, _order_index integer, _start_date date, _end_date date)
 RETURNS phases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.phases;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app_private.can_edit_project(_project_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  INSERT INTO public.phases (project_id, name, order_index, start_date, end_date)
  VALUES (_project_id, _name, _order_index, _start_date, _end_date)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_sprint_raw(_contract_id uuid, _sprint_number integer, _start_date date, _end_date date, _contracted_hours numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = _contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
          ARRAY['owner','admin','member']::public.workspace_role[])
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  SELECT id INTO _id FROM public.sprints
   WHERE contract_id = _contract_id AND sprint_number = _sprint_number;
  IF _id IS NULL THEN
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status, notes)
    VALUES (_contract_id, _sprint_number, _start_date, _end_date, COALESCE(_contracted_hours,0), 'por_planificar', _notes)
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
$function$;

CREATE OR REPLACE FUNCTION public.upsert_sprint_raw(_contract_id uuid, _sprint_number integer, _start_date date, _end_date date, _contracted_hours numeric, _notes text, _project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = _contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
          ARRAY['owner','admin','member']::public.workspace_role[])
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- El proyecto debe ser del mismo espacio que el contrato.
  IF _project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.contracts c ON c.workspace_id = p.workspace_id
     WHERE p.id = _project_id AND c.id = _contract_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;

DO $h$
DECLARE r record;
BEGIN
  -- Sin sesión nadie ejecuta funciones de la app.
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace IN ('public'::regnamespace, 'app_private'::regnamespace) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
  -- Las funciones de trigger no se invocan por RPC.
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'trigger'::regtype LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END
$h$;

-- Sin PUBLIC, las políticas de Storage necesitan este permiso explícito.
GRANT EXECUTE ON FUNCTION app_private.attachment_task_id(text) TO authenticated;
-- Solo la invocan triggers SECURITY DEFINER; la app no la llama por RPC.
REVOKE EXECUTE ON FUNCTION public.recalc_meeting_task_estimate(uuid) FROM authenticated;
