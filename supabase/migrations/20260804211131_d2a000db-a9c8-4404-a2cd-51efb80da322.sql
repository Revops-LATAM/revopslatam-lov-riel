CREATE OR REPLACE FUNCTION public.restore_deleted_task(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.deleted_tasks%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  SELECT * INTO r FROM public.deleted_tasks WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado'; END IF;

  IF NOT (
    public.has_role(v_uid, 'super_admin')
    OR (r.workspace_id IS NOT NULL AND public.has_workspace_role(r.workspace_id, v_uid, ARRAY['owner','admin']::public.workspace_role[]))
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF r.restored_at IS NOT NULL THEN RAISE EXCEPTION 'Esta tarea ya fue restaurada'; END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = r.task_id) THEN
    RAISE EXCEPTION 'La tarea ya existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = r.project_id) THEN
    RAISE EXCEPTION 'El proyecto original ya no existe';
  END IF;

  v_task := jsonb_populate_record(NULL::public.tasks, r.snapshot);

  IF v_task.parent_task_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = v_task.parent_task_id) THEN
    v_task.parent_task_id := NULL;
  END IF;
  IF v_task.sprint_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sprints WHERE id = v_task.sprint_id) THEN
    v_task.sprint_id := NULL;
  END IF;
  IF v_task.phase_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.phases WHERE id = v_task.phase_id) THEN
    v_task.phase_id := NULL;
  END IF;
  IF v_task.contract_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = v_task.contract_id) THEN
    RAISE EXCEPTION 'El contrato original ya no existe';
  END IF;

  -- La tarea ya existió con estas fechas: no revalidar días hábiles al restaurar.
  PERFORM set_config('app.skip_working_day_check', 'on', true);

  INSERT INTO public.tasks SELECT v_task.*;

  IF array_length(r.assignee_ids, 1) IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, user_id)
    SELECT r.task_id, u FROM unnest(r.assignee_ids) AS u
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('app.skip_working_day_check', 'off', true);

  UPDATE public.deleted_tasks SET restored_at = now(), restored_by = v_uid WHERE id = p_id;

  RETURN r.task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_deleted_task(uuid) TO authenticated;