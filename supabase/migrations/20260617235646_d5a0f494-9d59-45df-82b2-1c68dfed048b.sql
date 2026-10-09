CREATE OR REPLACE FUNCTION public.confirm_calendar_meeting(_event_id uuid, _project_id uuid, _sprint_id uuid, _phase_id uuid, _duration_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  ev public.calendar_events%ROWTYPE;
  v_task_id uuid;
  v_existing_task uuid;
  v_class_id uuid;
  v_task_type uuid;
  v_status uuid;
  v_contract uuid;
  v_area public.area;
  v_minutes int;
  v_ended timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO ev FROM public.calendar_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF ev.user_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _project_id IS NULL THEN RAISE EXCEPTION 'project required'; END IF;

  v_minutes := COALESCE(
    _duration_minutes,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (ev.end_at - ev.start_at))/60.0))::int
  );
  v_ended := ev.start_at + (v_minutes || ' minutes')::interval;

  SELECT contract_id, area INTO v_contract, v_area
    FROM public.projects WHERE id = _project_id;

  SELECT id INTO v_task_type FROM public.task_types
    WHERE workspace_id = ev.workspace_id AND key = 'reunion' LIMIT 1;
  IF v_task_type IS NULL THEN
    RAISE EXCEPTION 'reunion task type missing for workspace';
  END IF;

  SELECT id INTO v_status FROM public.task_statuses
    WHERE task_type_id = v_task_type AND category = 'completada'
    ORDER BY is_default DESC, sort_order ASC LIMIT 1;

  IF ev.google_recurring_event_id IS NOT NULL THEN
    SELECT id, shared_task_id INTO v_class_id, v_existing_task
      FROM public.calendar_recurring_classifications
     WHERE workspace_id = ev.workspace_id
       AND google_recurring_event_id = ev.google_recurring_event_id
     LIMIT 1;
  END IF;

  IF v_existing_task IS NOT NULL THEN
    v_task_id := v_existing_task;
    UPDATE public.tasks
       SET project_id = _project_id,
           contract_id = CASE WHEN v_area = 'marketing' THEN NULL ELSE v_contract END,
           sprint_id = _sprint_id,
           phase_id = _phase_id
     WHERE id = v_task_id;
  ELSE
    INSERT INTO public.tasks (
      project_id, contract_id, sprint_id, phase_id,
      task_type_id, status_id, title, created_by, area
    ) VALUES (
      _project_id,
      CASE WHEN v_area = 'marketing' THEN NULL ELSE v_contract END,
      _sprint_id, _phase_id,
      v_task_type, v_status,
      COALESCE(ev.title, '(Reunión sin título)'),
      uid, v_area
    )
    RETURNING id INTO v_task_id;
  END IF;

  IF ev.google_recurring_event_id IS NOT NULL THEN
    IF v_class_id IS NULL THEN
      INSERT INTO public.calendar_recurring_classifications (
        workspace_id, user_id, connection_id, google_recurring_event_id,
        project_id, sprint_id, phase_id, task_id, shared_task_id, classified_by, inbox_status
      ) VALUES (
        ev.workspace_id, uid, ev.connection_id, ev.google_recurring_event_id,
        _project_id, _sprint_id, _phase_id, v_task_id, v_task_id, uid, 'classified'
      );
    ELSE
      UPDATE public.calendar_recurring_classifications
         SET project_id = _project_id, sprint_id = _sprint_id, phase_id = _phase_id,
             shared_task_id = v_task_id, task_id = v_task_id
       WHERE id = v_class_id;
    END IF;
  END IF;

  UPDATE public.calendar_events
     SET project_id = _project_id, sprint_id = _sprint_id, phase_id = _phase_id,
         task_id = v_task_id, inbox_status = 'classified',
         classified_at = now(), classified_by = uid
   WHERE id = _event_id;

  INSERT INTO public.time_entries (
    task_id, user_id, started_at, ended_at, source, calendar_event_id, is_billable
  ) VALUES (
    v_task_id, uid, ev.start_at, v_ended, 'calendar', _event_id, true
  )
  ON CONFLICT (user_id, calendar_event_id) WHERE calendar_event_id IS NOT NULL
  DO UPDATE SET ended_at = EXCLUDED.ended_at, task_id = EXCLUDED.task_id, updated_at = now();

  RETURN jsonb_build_object('task_id', v_task_id, 'minutes', v_minutes);
END;
$function$;