
-- 1) Backfill task_assignees desde tasks.assignee_id
INSERT INTO public.task_assignees (task_id, user_id, is_primary)
SELECT id, assignee_id, false
FROM public.tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2) task_estimates.manual
ALTER TABLE public.task_estimates
  ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

-- 3) Función de recomputo del split
CREATE OR REPLACE FUNCTION public.recompute_task_estimate_split(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric(10,2);
  v_manual_sum numeric(10,2) := 0;
  v_manual_users uuid[] := ARRAY[]::uuid[];
  v_all_users uuid[] := ARRAY[]::uuid[];
  v_auto_users uuid[] := ARRAY[]::uuid[];
  v_auto_hours numeric(10,2) := 0;
  v_share numeric(10,2) := 0;
  v_new_total numeric(10,2);
BEGIN
  SELECT COALESCE(total_effort_hours, 0) INTO v_total FROM public.tasks WHERE id = _task_id;

  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[])
    INTO v_all_users
    FROM public.task_assignees WHERE task_id = _task_id;

  -- Overrides manuales existentes (solo para asignados actuales)
  SELECT COALESCE(array_agg(te.user_id), ARRAY[]::uuid[]),
         COALESCE(SUM(te.hours), 0)
    INTO v_manual_users, v_manual_sum
    FROM public.task_estimates te
    WHERE te.task_id = _task_id
      AND te.manual = true
      AND te.user_id = ANY(v_all_users);

  -- Limpiar estimates de usuarios que ya no son asignados
  DELETE FROM public.task_estimates
   WHERE task_id = _task_id
     AND (v_all_users = ARRAY[]::uuid[] OR NOT (user_id = ANY(v_all_users)));

  IF array_length(v_all_users, 1) IS NULL THEN
    -- Sin asignados; nada más que hacer
    RETURN;
  END IF;

  -- Usuarios sin override manual reciben el split automático
  SELECT COALESCE(array_agg(u), ARRAY[]::uuid[])
    INTO v_auto_users
    FROM unnest(v_all_users) u
    WHERE NOT (u = ANY(v_manual_users));

  IF array_length(v_auto_users, 1) IS NOT NULL AND array_length(v_auto_users, 1) > 0 THEN
    v_auto_hours := GREATEST(0, v_total - v_manual_sum);
    v_share := ROUND(v_auto_hours / array_length(v_auto_users, 1)::numeric, 2);
  END IF;

  -- Upsert filas para cada asignado
  INSERT INTO public.task_estimates (task_id, user_id, hours, manual)
  SELECT _task_id, u,
         CASE WHEN u = ANY(v_manual_users) THEN
           (SELECT hours FROM public.task_estimates WHERE task_id = _task_id AND user_id = u)
         ELSE v_share END,
         u = ANY(v_manual_users)
  FROM unnest(v_all_users) u
  ON CONFLICT (task_id, user_id) DO UPDATE
     SET hours = EXCLUDED.hours,
         manual = EXCLUDED.manual,
         updated_at = now();

  -- Actualizar total = suma de horas (para reflejar overrides que suman distinto)
  SELECT COALESCE(SUM(hours), 0) INTO v_new_total
    FROM public.task_estimates WHERE task_id = _task_id;

  IF v_new_total IS DISTINCT FROM v_total THEN
    UPDATE public.tasks SET total_effort_hours = v_new_total WHERE id = _task_id;
  END IF;
END;
$$;

-- unique constraint necesaria para el ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.task_estimates'::regclass
       AND conname = 'task_estimates_task_user_unique'
  ) THEN
    ALTER TABLE public.task_estimates
      ADD CONSTRAINT task_estimates_task_user_unique UNIQUE (task_id, user_id);
  END IF;
END $$;

-- 4) Trigger sobre task_assignees para recomputar
CREATE OR REPLACE FUNCTION public.tg_task_assignees_recompute_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task uuid;
BEGIN
  v_task := COALESCE(NEW.task_id, OLD.task_id);
  PERFORM public.recompute_task_estimate_split(v_task);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignees_recompute_estimate ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_recompute_estimate
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.tg_task_assignees_recompute_estimate();

-- 5) Trigger sobre tasks cuando cambia total_effort_hours
CREATE OR REPLACE FUNCTION public.tg_tasks_recompute_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.total_effort_hours IS DISTINCT FROM OLD.total_effort_hours THEN
    PERFORM public.recompute_task_estimate_split(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_recompute_estimate ON public.tasks;
CREATE TRIGGER trg_tasks_recompute_estimate
AFTER UPDATE OF total_effort_hours ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_recompute_estimate();

-- 6) Backfill estimates para tareas existentes con asignados
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT task_id FROM public.task_assignees LOOP
    PERFORM public.recompute_task_estimate_split(r.task_id);
  END LOOP;
END $$;

-- 7) calendar_event_assignees
CREATE TABLE IF NOT EXISTS public.calendar_event_assignees (
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_assignees TO authenticated;
GRANT ALL ON public.calendar_event_assignees TO service_role;

ALTER TABLE public.calendar_event_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cea_select_workspace" ON public.calendar_event_assignees;
CREATE POLICY "cea_select_workspace" ON public.calendar_event_assignees
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.calendar_events e
  WHERE e.id = event_id AND public.is_workspace_member(e.workspace_id, auth.uid())
));

DROP POLICY IF EXISTS "cea_write_workspace" ON public.calendar_event_assignees;
CREATE POLICY "cea_write_workspace" ON public.calendar_event_assignees
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.calendar_events e
  WHERE e.id = event_id AND public.is_workspace_member(e.workspace_id, auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.calendar_events e
  WHERE e.id = event_id AND public.is_workspace_member(e.workspace_id, auth.uid())
));

CREATE INDEX IF NOT EXISTS idx_cea_user ON public.calendar_event_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);
