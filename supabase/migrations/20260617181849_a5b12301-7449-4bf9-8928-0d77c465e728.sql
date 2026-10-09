-- Phase C: drop legacy enum status column, use only status_id

-- 1. Drop triggers that depend on tasks.status
DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_completion ON public.tasks;
DROP TRIGGER IF EXISTS enforce_backlog_task_status_trg ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_activity_upd ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_activity_ins ON public.tasks;

-- 2. Recreate handle_task_completion using status_id + category
CREATE OR REPLACE FUNCTION public.handle_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_cat public.task_status_category;
  old_cat public.task_status_category;
BEGIN
  IF NEW.status_id IS NOT NULL THEN
    SELECT category INTO new_cat FROM public.task_statuses WHERE id = NEW.status_id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status_id IS NOT NULL THEN
    SELECT category INTO old_cat FROM public.task_statuses WHERE id = OLD.status_id;
  END IF;

  IF new_cat = 'completada' AND (old_cat IS DISTINCT FROM 'completada') THEN
    NEW.completed_at := now();
  ELSIF new_cat IS DISTINCT FROM 'completada' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Recreate enforce_backlog_task_status using status_id
CREATE OR REPLACE FUNCTION public.enforce_backlog_task_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  ctype public.contract_type;
  cat public.task_status_category;
  default_open uuid;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
  IF ctype <> 'recurrente' THEN
    RETURN NEW;
  END IF;

  IF NEW.sprint_id IS NULL AND NEW.status_id IS NOT NULL THEN
    SELECT category INTO cat FROM public.task_statuses WHERE id = NEW.status_id;
    IF cat NOT IN ('abierta','cancelada') THEN
      SELECT id INTO default_open
        FROM public.task_statuses
       WHERE task_type_id = NEW.task_type_id AND category = 'abierta'
       ORDER BY is_default DESC, sort_order ASC LIMIT 1;
      IF default_open IS NOT NULL THEN
        NEW.status_id := default_open;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Rewrite log_task_activity to use status_id (resolves to status key text)
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor uuid := COALESCE(auth.uid(), NEW.created_by);
  old_key text;
  new_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'created', NULL, NEW.title);
    RETURN NEW;
  END IF;

  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    SELECT key INTO old_key FROM public.task_statuses WHERE id = OLD.status_id;
    SELECT key INTO new_key FROM public.task_statuses WHERE id = NEW.status_id;
    INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.id, actor, 'status', old_key, new_key);
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

-- 5. Drop legacy indexes on status
DROP INDEX IF EXISTS public.idx_tasks_project_status;
DROP INDEX IF EXISTS public.idx_tasks_assignee_status;

-- 6. Enforce NOT NULL on status_id and drop legacy status column
ALTER TABLE public.tasks ALTER COLUMN status_id SET NOT NULL;
ALTER TABLE public.tasks DROP COLUMN status;

-- 7. Drop the legacy enum (no longer referenced)
DROP TYPE IF EXISTS public.task_status;

-- 8. Recreate triggers
CREATE TRIGGER trg_tasks_completion
  BEFORE UPDATE OF status_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_completion();

CREATE TRIGGER enforce_backlog_task_status_trg
  BEFORE INSERT OR UPDATE OF sprint_id, status_id, contract_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_backlog_task_status();

CREATE TRIGGER trg_tasks_activity_ins
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

CREATE TRIGGER trg_tasks_activity_upd
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();
