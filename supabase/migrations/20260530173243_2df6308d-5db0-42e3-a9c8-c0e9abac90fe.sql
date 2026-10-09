-- Activity log for tasks (system events: status, assignee, due_date, priority, title)
CREATE TABLE public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('status','assignee','due_date','priority','title','created')),
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_activity_task_id_created_at ON public.task_activity(task_id, created_at DESC);

GRANT SELECT, INSERT ON public.task_activity TO authenticated;
GRANT ALL ON public.task_activity TO service_role;

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_select ON public.task_activity
  FOR SELECT TO authenticated
  USING (app_private.can_access_task(task_id, auth.uid()));

CREATE POLICY activity_insert ON public.task_activity
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_task(task_id, auth.uid()) AND actor_id = auth.uid());

-- Trigger function: emit one row per changed tracked column
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := COALESCE(auth.uid(), NEW.created_by);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'created', NULL, NEW.title);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'assignee',
      CASE WHEN OLD.assignee_id IS NULL THEN NULL ELSE OLD.assignee_id::text END,
      CASE WHEN NEW.assignee_id IS NULL THEN NULL ELSE NEW.assignee_id::text END);
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'due_date',
      CASE WHEN OLD.due_date IS NULL THEN NULL ELSE OLD.due_date::text END,
      CASE WHEN NEW.due_date IS NULL THEN NULL ELSE NEW.due_date::text END);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'priority', OLD.priority::text, NEW.priority::text);
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'title', OLD.title, NEW.title);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_activity_ins
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

CREATE TRIGGER trg_tasks_activity_upd
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();