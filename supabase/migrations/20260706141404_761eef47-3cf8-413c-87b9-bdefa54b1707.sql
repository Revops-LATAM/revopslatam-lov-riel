
-- Multi-assignees per task + external ref for idempotent imports

-- 1) external_ref on tasks (nullable) + partial unique index by project
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_external_ref_uidx
  ON public.tasks (project_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- 2) task_assignees table
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS task_assignees_primary_uidx
  ON public.task_assignees (task_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS task_assignees_user_idx
  ON public.task_assignees (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees TO authenticated;
GRANT ALL ON public.task_assignees TO service_role;

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read task assignees"
  ON public.task_assignees FOR SELECT
  USING (public.can_access_task(task_id, auth.uid()));

CREATE POLICY "members can write task assignees"
  ON public.task_assignees FOR ALL
  USING (public.can_access_task(task_id, auth.uid()))
  WITH CHECK (public.can_access_task(task_id, auth.uid()));

-- 3) Trigger to keep tasks.assignee_id mirrored to the primary
CREATE OR REPLACE FUNCTION public.sync_primary_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task uuid;
  v_primary uuid;
BEGIN
  v_task := COALESCE(NEW.task_id, OLD.task_id);
  SELECT user_id INTO v_primary
    FROM public.task_assignees
    WHERE task_id = v_task
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;
  UPDATE public.tasks SET assignee_id = v_primary WHERE id = v_task;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignees_sync ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_task_assignee();
