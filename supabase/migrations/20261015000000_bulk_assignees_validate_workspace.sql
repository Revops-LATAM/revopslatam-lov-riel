-- Riel 2.0 / Seguridad: insert_task_assignees_bulk debe validar que cada persona asignada
-- pertenezca al espacio de trabajo de la tarea (antes solo se validaba el acceso a la tarea).
CREATE OR REPLACE FUNCTION public.insert_task_assignees_bulk(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_workspace uuid;
  r record;
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  FOR r IN
    SELECT (x->>'task_id')::uuid AS task_id,
           (x->>'user_id')::uuid AS user_id,
           COALESCE((x->>'is_primary')::boolean, false) AS is_primary
    FROM jsonb_array_elements(_rows) x
  LOOP
    IF NOT public.can_access_task(r.task_id, auth.uid()) THEN
      RAISE EXCEPTION 'Sin acceso a la tarea %', r.task_id USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT p.workspace_id INTO v_workspace
    FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = r.task_id;

    IF v_workspace IS NULL OR NOT public.is_workspace_member(r.user_id, v_workspace) THEN
      RAISE EXCEPTION 'El usuario % no pertenece al espacio de la tarea %', r.user_id, r.task_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.task_assignees (task_id, user_id, is_primary)
    VALUES (r.task_id, r.user_id, r.is_primary)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.insert_task_assignees_bulk(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_task_assignees_bulk(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_task_assignees_bulk(jsonb) TO service_role;
