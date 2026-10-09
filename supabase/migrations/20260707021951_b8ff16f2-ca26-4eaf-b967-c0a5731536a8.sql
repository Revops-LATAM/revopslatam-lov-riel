
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
    SET total_effort_hours = ROUND(((v_dur::numeric / 60.0) * v_count)::numeric, 2)
    WHERE id = _task_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_meeting_task_estimate(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_tasks_meeting_estimate() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_task_assignees_meeting_estimate() FROM PUBLIC, anon;
