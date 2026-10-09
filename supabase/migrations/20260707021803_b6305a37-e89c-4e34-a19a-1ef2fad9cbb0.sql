
-- 1) New columns for meeting tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS meeting_start_time time,
  ADD COLUMN IF NOT EXISTS meeting_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS meeting_timezone text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_connection_id uuid REFERENCES public.user_calendar_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_event_html_link text;

CREATE INDEX IF NOT EXISTS idx_tasks_google_event_id ON public.tasks(google_event_id) WHERE google_event_id IS NOT NULL;

-- 2) Recalc estimated_hours for meeting tasks = duration/60 * count(assignees)
CREATE OR REPLACE FUNCTION public.recalc_meeting_task_estimate(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_dur int;
  v_count int;
BEGIN
  SELECT tt.key, t.meeting_duration_minutes
    INTO v_key, v_dur
    FROM public.tasks t
    LEFT JOIN public.task_types tt ON tt.id = t.task_type_id
    WHERE t.id = _task_id;

  IF v_key IS DISTINCT FROM 'reunion' OR v_dur IS NULL OR v_dur <= 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.task_assignees WHERE task_id = _task_id;
  IF v_count = 0 THEN v_count := 1; END IF;

  UPDATE public.tasks
    SET estimated_hours = ROUND(((v_dur::numeric / 60.0) * v_count)::numeric, 2)
    WHERE id = _task_id;
END;
$$;

-- Trigger on tasks: after insert/update of duration or task_type_id
CREATE OR REPLACE FUNCTION public.trg_tasks_meeting_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_meeting_task_estimate(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_meeting_estimate_aiu ON public.tasks;
CREATE TRIGGER tasks_meeting_estimate_aiu
AFTER INSERT OR UPDATE OF meeting_duration_minutes, task_type_id
ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tasks_meeting_estimate();

-- Trigger on task_assignees: recalc when assignees change
CREATE OR REPLACE FUNCTION public.trg_task_assignees_meeting_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_meeting_task_estimate(OLD.task_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_meeting_task_estimate(NEW.task_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS task_assignees_meeting_estimate_aid ON public.task_assignees;
CREATE TRIGGER task_assignees_meeting_estimate_aid
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.trg_task_assignees_meeting_estimate();
