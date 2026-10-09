-- Recreate legacy enum
CREATE TYPE public.task_status AS ENUM (
  'nueva','planificada','en_curso','en_pausa','revision_interna',
  'revision_cliente','en_correccion','demorada','completada','cancelada'
);

-- Add column nullable first, backfill, then enforce NOT NULL
ALTER TABLE public.tasks ADD COLUMN status public.task_status;

-- Backfill from status_id category
UPDATE public.tasks t SET status = (
  CASE ts.category
    WHEN 'completada' THEN 'completada'::public.task_status
    WHEN 'cancelada'  THEN 'cancelada'::public.task_status
    WHEN 'bloqueada'  THEN 'en_pausa'::public.task_status
    WHEN 'en_progreso' THEN 'en_curso'::public.task_status
    ELSE 'nueva'::public.task_status
  END
)
FROM public.task_statuses ts WHERE ts.id = t.status_id;

ALTER TABLE public.tasks ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'nueva';

-- Sync trigger: status follows status_id
CREATE OR REPLACE FUNCTION public.sync_task_status_mirror()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cat public.task_status_category;
BEGIN
  IF NEW.status_id IS NULL THEN RETURN NEW; END IF;
  SELECT category INTO cat FROM public.task_statuses WHERE id = NEW.status_id;
  NEW.status := CASE cat
    WHEN 'completada' THEN 'completada'::public.task_status
    WHEN 'cancelada'  THEN 'cancelada'::public.task_status
    WHEN 'bloqueada'  THEN 'en_pausa'::public.task_status
    WHEN 'en_progreso' THEN 'en_curso'::public.task_status
    ELSE 'nueva'::public.task_status
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_sync_status_mirror
  BEFORE INSERT OR UPDATE OF status_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_status_mirror();
