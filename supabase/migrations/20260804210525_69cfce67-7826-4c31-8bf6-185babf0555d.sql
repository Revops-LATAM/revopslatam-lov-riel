CREATE TABLE IF NOT EXISTS public.deleted_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  workspace_id uuid,
  project_id uuid,
  project_name text,
  title text NOT NULL,
  snapshot jsonb NOT NULL,
  assignee_ids uuid[] NOT NULL DEFAULT '{}',
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored_by uuid
);

CREATE INDEX IF NOT EXISTS deleted_tasks_ws_idx ON public.deleted_tasks (workspace_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS deleted_tasks_task_idx ON public.deleted_tasks (task_id);

GRANT SELECT ON public.deleted_tasks TO authenticated;
GRANT ALL ON public.deleted_tasks TO service_role;

ALTER TABLE public.deleted_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins can view deleted tasks"
ON public.deleted_tasks
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  )
);

CREATE OR REPLACE FUNCTION public.tg_tasks_capture_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
  v_pname text;
  v_assignees uuid[];
BEGIN
  SELECT p.workspace_id, p.name INTO v_ws, v_pname
  FROM public.projects p WHERE p.id = OLD.project_id;

  SELECT COALESCE(array_agg(ta.user_id), '{}')
    INTO v_assignees
  FROM public.task_assignees ta WHERE ta.task_id = OLD.id;

  INSERT INTO public.deleted_tasks (task_id, workspace_id, project_id, project_name, title, snapshot, assignee_ids, deleted_by)
  VALUES (OLD.id, v_ws, OLD.project_id, v_pname, OLD.title, to_jsonb(OLD), v_assignees, auth.uid());

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_tasks_capture_delete_trg ON public.tasks;
CREATE TRIGGER tg_tasks_capture_delete_trg
BEFORE DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_capture_delete();

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

  INSERT INTO public.tasks SELECT v_task.*;

  IF array_length(r.assignee_ids, 1) IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, user_id)
    SELECT r.task_id, u FROM unnest(r.assignee_ids) AS u
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.deleted_tasks SET restored_at = now(), restored_by = v_uid WHERE id = p_id;

  RETURN r.task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_deleted_task(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_deleted_tasks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.deleted_tasks WHERE deleted_at < now() - interval '30 days';
$$;

SELECT cron.schedule('purge-deleted-tasks', '30 4 * * *', $$SELECT public.purge_deleted_tasks();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-deleted-tasks');