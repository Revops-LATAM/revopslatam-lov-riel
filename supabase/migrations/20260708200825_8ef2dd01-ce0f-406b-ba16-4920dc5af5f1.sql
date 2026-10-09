CREATE OR REPLACE FUNCTION public.insert_task_recurrence_batch(_rows jsonb)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Authorize: caller must be able to edit every project referenced
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_rows) r
    WHERE NOT public.can_edit_project((r->>'project_id')::uuid, v_uid)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create tasks in this project';
  END IF;

  PERFORM set_config('app.skip_working_day_check', 'on', true);

  RETURN QUERY
  INSERT INTO public.tasks (
    project_id, title, description, priority, assignee_id, due_date, start_date,
    contract_id, sprint_id, phase_id, task_type_id, status_id, effort_mode,
    total_effort_hours, meeting_start_time, meeting_duration_minutes, meeting_timezone,
    created_by, position
  )
  SELECT
    (r->>'project_id')::uuid,
    r->>'title',
    r->>'description',
    r->>'priority',
    NULLIF(r->>'assignee_id','')::uuid,
    NULLIF(r->>'due_date','')::date,
    NULLIF(r->>'start_date','')::date,
    NULLIF(r->>'contract_id','')::uuid,
    NULLIF(r->>'sprint_id','')::uuid,
    NULLIF(r->>'phase_id','')::uuid,
    NULLIF(r->>'task_type_id','')::uuid,
    (r->>'status_id')::uuid,
    r->>'effort_mode',
    NULLIF(r->>'total_effort_hours','')::numeric,
    NULLIF(r->>'meeting_start_time','')::time,
    NULLIF(r->>'meeting_duration_minutes','')::int,
    NULLIF(r->>'meeting_timezone',''),
    v_uid,
    (r->>'position')::int
  FROM jsonb_array_elements(_rows) r
  RETURNING tasks.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_task_recurrence_batch(jsonb) TO authenticated, service_role;