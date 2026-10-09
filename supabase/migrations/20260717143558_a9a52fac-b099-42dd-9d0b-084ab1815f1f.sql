CREATE OR REPLACE FUNCTION public.check_due_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  created_count int := 0;
BEGIN
  -- Due within 24h (not already notified as due_soon)
  FOR r IN
    SELECT t.id, p.workspace_id, t.title, t.due_date AS end_date, ta.user_id
    FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN public.task_assignees ta ON ta.task_id = t.id
    LEFT JOIN public.task_statuses ts ON ts.id = t.status_id
    WHERE t.due_date IS NOT NULL
      AND t.due_date >= current_date
      AND t.due_date <= current_date + 1
      AND COALESCE(ts.key, t.status::text, '') NOT IN ('completada','cancelada','done','completed','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.entity_id = t.id AND n.user_id = ta.user_id
          AND n.kind = 'due_soon'
          AND n.created_at > now() - interval '48 hours'
      )
  LOOP
    PERFORM public.enqueue_notification(
      r.workspace_id, r.user_id, NULL, 'due_soon',
      'Vence pronto: ' || COALESCE(r.title,''),
      'Vence ' || to_char(r.end_date, 'DD-MM-YYYY'),
      'task', r.id, '/tasks/' || r.id::text
    );
    created_count := created_count + 1;
  END LOOP;

  -- Overdue (past due, not notified in last 24h)
  FOR r IN
    SELECT t.id, p.workspace_id, t.title, t.due_date AS end_date, ta.user_id
    FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN public.task_assignees ta ON ta.task_id = t.id
    LEFT JOIN public.task_statuses ts ON ts.id = t.status_id
    WHERE t.due_date IS NOT NULL
      AND t.due_date < current_date
      AND t.due_date > current_date - 7
      AND COALESCE(ts.key, t.status::text, '') NOT IN ('completada','cancelada','done','completed','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.entity_id = t.id AND n.user_id = ta.user_id
          AND n.kind = 'overdue'
          AND n.created_at > now() - interval '24 hours'
      )
  LOOP
    PERFORM public.enqueue_notification(
      r.workspace_id, r.user_id, NULL, 'overdue',
      'Vencida: ' || COALESCE(r.title,''),
      'Venció el ' || to_char(r.end_date, 'DD-MM-YYYY'),
      'task', r.id, '/tasks/' || r.id::text
    );
    created_count := created_count + 1;
  END LOOP;

  RETURN created_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'check_due_tasks failed: %', SQLERRM;
  RETURN created_count;
END;
$$;