
-- ============ task_estimates ============
CREATE TABLE public.task_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  hours numeric(8,2) NOT NULL CHECK (hours >= 0 AND hours <= 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
CREATE INDEX idx_task_estimates_task ON public.task_estimates(task_id);
CREATE INDEX idx_task_estimates_user ON public.task_estimates(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_estimates TO authenticated;
GRANT ALL ON public.task_estimates TO service_role;

ALTER TABLE public.task_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimates_select ON public.task_estimates FOR SELECT TO authenticated
  USING (app_private.can_access_task(task_id, auth.uid()));
CREATE POLICY estimates_insert ON public.task_estimates FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_task(task_id, auth.uid()));
CREATE POLICY estimates_update ON public.task_estimates FOR UPDATE TO authenticated
  USING (app_private.can_access_task(task_id, auth.uid()));
CREATE POLICY estimates_delete ON public.task_estimates FOR DELETE TO authenticated
  USING (app_private.can_access_task(task_id, auth.uid()));

CREATE TRIGGER trg_task_estimates_updated_at
BEFORE UPDATE ON public.task_estimates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ time_entries ============
CREATE TYPE public.time_entry_source AS ENUM ('manual', 'timer');

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_minutes integer,
  note text,
  is_billable boolean NOT NULL DEFAULT true,
  source public.time_entry_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX idx_time_entries_task ON public.time_entries(task_id);
CREATE INDEX idx_time_entries_user ON public.time_entries(user_id);
CREATE INDEX idx_time_entries_started ON public.time_entries(started_at);
-- Solo un timer activo por usuario
CREATE UNIQUE INDEX idx_time_entries_one_active_per_user
  ON public.time_entries(user_id) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_entries_select ON public.time_entries FOR SELECT TO authenticated
  USING (app_private.can_access_task(task_id, auth.uid()));
CREATE POLICY time_entries_insert ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_task(task_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY time_entries_update_own ON public.time_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY time_entries_delete_own ON public.time_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Trigger: calcula duration al cerrar
CREATE OR REPLACE FUNCTION public.compute_time_entry_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    NEW.duration_minutes := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0))::int;
  ELSE
    NEW.duration_minutes := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_time_entries_duration
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.compute_time_entry_duration();

-- Logging a task_activity
CREATE OR REPLACE FUNCTION public.log_time_entry_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := COALESCE(auth.uid(), NEW.user_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NULL THEN
      INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
      VALUES (NEW.id::uuid, actor, 'time_started', NULL, NEW.started_at::text);
      -- fix task_id (typo guard above keeps clean; correct insert below)
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Reemplazo limpio (la función previa tenía un guard, simplificamos):
CREATE OR REPLACE FUNCTION public.log_time_entry_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := COALESCE(auth.uid(), NEW.user_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NULL THEN
      INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
      VALUES (NEW.task_id, actor, 'time_started', NULL, NEW.started_at::text);
    ELSE
      INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
      VALUES (NEW.task_id, actor, 'time_added', NULL, NEW.duration_minutes::text);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
      INSERT INTO public.task_activity(task_id, actor_id, kind, from_value, to_value)
      VALUES (NEW.task_id, actor, 'time_stopped', NULL, NEW.duration_minutes::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_time_entry_activity
AFTER INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.log_time_entry_activity();

-- ============ user_capacity ============
CREATE TABLE public.user_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  daily_hours numeric(4,2) NOT NULL DEFAULT 8 CHECK (daily_hours >= 0 AND daily_hours <= 24),
  weekly_pattern numeric(4,2)[] NOT NULL DEFAULT ARRAY[8,8,8,8,8,0,0]::numeric(4,2)[],
  hourly_rate numeric(10,2),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_capacity TO authenticated;
GRANT ALL ON public.user_capacity TO service_role;

ALTER TABLE public.user_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY capacity_select ON public.user_capacity FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY capacity_insert_admin ON public.user_capacity FOR INSERT TO authenticated
  WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));
CREATE POLICY capacity_update_admin ON public.user_capacity FOR UPDATE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));
CREATE POLICY capacity_delete_admin ON public.user_capacity FOR DELETE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER trg_user_capacity_updated_at
BEFORE UPDATE ON public.user_capacity
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ workspace_holidays ============
CREATE TYPE public.holiday_scope AS ENUM ('all', 'user');

CREATE TABLE public.workspace_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  affects public.holiday_scope NOT NULL DEFAULT 'all',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((affects = 'all' AND user_id IS NULL) OR (affects = 'user' AND user_id IS NOT NULL))
);
CREATE INDEX idx_holidays_ws_date ON public.workspace_holidays(workspace_id, date);
CREATE INDEX idx_holidays_user ON public.workspace_holidays(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_holidays TO authenticated;
GRANT ALL ON public.workspace_holidays TO service_role;

ALTER TABLE public.workspace_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY holidays_select ON public.workspace_holidays FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY holidays_insert ON public.workspace_holidays FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[])
    OR (affects = 'user' AND user_id = auth.uid())
  );
CREATE POLICY holidays_update ON public.workspace_holidays FOR UPDATE TO authenticated
  USING (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[])
    OR (affects = 'user' AND user_id = auth.uid())
  );
CREATE POLICY holidays_delete ON public.workspace_holidays FOR DELETE TO authenticated
  USING (
    app_private.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[])
    OR (affects = 'user' AND user_id = auth.uid())
  );

-- ============ projects extension ============
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS default_billable boolean NOT NULL DEFAULT true;
