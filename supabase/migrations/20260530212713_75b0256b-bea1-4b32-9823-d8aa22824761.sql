
-- 1) workspaces: timezone + allocation strategy
DO $$ BEGIN
  CREATE TYPE public.allocation_strategy AS ENUM ('due_date', 'spread', 'fit_capacity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS allocation_strategy public.allocation_strategy NOT NULL DEFAULT 'fit_capacity';

-- 2) user_capacity: max timer hours + pattern_custom + auto-sync trigger
ALTER TABLE public.user_capacity
  ADD COLUMN IF NOT EXISTS max_timer_hours numeric(4,2) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS pattern_custom boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sync_capacity_pattern()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pattern_custom = false THEN
    IF TG_OP = 'INSERT' OR NEW.daily_hours IS DISTINCT FROM OLD.daily_hours THEN
      NEW.weekly_pattern := ARRAY[
        NEW.daily_hours, NEW.daily_hours, NEW.daily_hours,
        NEW.daily_hours, NEW.daily_hours, 0::numeric(4,2), 0::numeric(4,2)
      ]::numeric(4,2)[];
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_capacity_pattern ON public.user_capacity;
CREATE TRIGGER trg_sync_capacity_pattern
BEFORE INSERT OR UPDATE ON public.user_capacity
FOR EACH ROW EXECUTE FUNCTION public.sync_capacity_pattern();

-- 3) projects: client_name
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_name text;

-- 4) time_entry_source: add 'auto_stopped'
DO $$ BEGIN
  ALTER TYPE public.time_entry_source ADD VALUE IF NOT EXISTS 'auto_stopped';
EXCEPTION WHEN others THEN NULL; END $$;

-- 5) view task_estimate_rollup
CREATE OR REPLACE VIEW public.task_estimate_rollup AS
SELECT
  t.id AS task_id,
  t.project_id,
  COALESCE((SELECT SUM(e.hours)::numeric(10,2) FROM public.task_estimates e WHERE e.task_id = t.id), 0) AS total_estimate_hours,
  COALESCE((SELECT (SUM(te.duration_minutes)::numeric / 60.0)::numeric(10,2)
            FROM public.time_entries te
            WHERE te.task_id = t.id AND te.duration_minutes IS NOT NULL), 0) AS total_logged_hours
FROM public.tasks t;

GRANT SELECT ON public.task_estimate_rollup TO authenticated;
GRANT ALL ON public.task_estimate_rollup TO service_role;
