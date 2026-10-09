DROP VIEW IF EXISTS public.task_estimate_rollup;

CREATE VIEW public.task_estimate_rollup
WITH (security_invoker = true) AS
SELECT
  t.id AS task_id,
  t.project_id,
  COALESCE(t.total_effort_hours, 0)::numeric(10,2) AS total_estimate_hours,
  COALESCE((
    SELECT SUM(te.duration_minutes)::numeric / 60.0
    FROM public.time_entries te
    WHERE te.task_id = t.id AND te.duration_minutes IS NOT NULL
  ), 0)::numeric(10,2) AS total_logged_hours
FROM public.tasks t;

GRANT SELECT ON public.task_estimate_rollup TO authenticated;
GRANT ALL ON public.task_estimate_rollup TO service_role;