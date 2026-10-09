-- 1) Backfill asignados de la serie recurrente
DO $$
BEGIN
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  INSERT INTO public.task_assignees (task_id, user_id, is_primary)
  SELECT t.id, a.user_id, a.is_primary
  FROM public.tasks t
  CROSS JOIN (
    SELECT user_id, is_primary FROM public.task_assignees
    WHERE task_id = '3f3e72d7-6493-4293-9f25-45d8df9de7a9'
  ) a
  WHERE t.created_at = '2026-08-14 18:03:19.92852+00'
    AND t.title = 'Reunión equipo Revops LATAM'
  ON CONFLICT (task_id, user_id) DO NOTHING;
END $$;

-- 2) RPC para insertar asignados en lote (usada por la recurrencia)
CREATE OR REPLACE FUNCTION public.insert_task_assignees_bulk(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
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