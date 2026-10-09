
-- 1) Rewrite task_estimate_rollup: single GROUP BY join instead of correlated subquery per row
CREATE OR REPLACE VIEW public.task_estimate_rollup AS
SELECT
  t.id AS task_id,
  t.project_id,
  COALESCE(t.total_effort_hours, 0)::numeric(10,2) AS total_estimate_hours,
  COALESCE(te.logged_hours, 0)::numeric(10,2) AS total_logged_hours
FROM public.tasks t
LEFT JOIN (
  SELECT task_id, SUM(duration_minutes)::numeric / 60.0 AS logged_hours
  FROM public.time_entries
  WHERE duration_minutes IS NOT NULL
  GROUP BY task_id
) te ON te.task_id = t.id;

GRANT SELECT ON public.task_estimate_rollup TO authenticated;
GRANT SELECT ON public.task_estimate_rollup TO service_role;

-- 2) Aggregated RPC for a single project (returns one row, avoids shipping all tasks)
CREATE OR REPLACE FUNCTION public.get_project_time_health(p_project_id uuid)
RETURNS TABLE(estimate_hours numeric, logged_hours numeric, task_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(COALESCE(t.total_effort_hours, 0)), 0)::numeric(12,2) AS estimate_hours,
    COALESCE(SUM(COALESCE(te.logged_hours, 0)), 0)::numeric(12,2) AS logged_hours,
    COUNT(*)::bigint AS task_count
  FROM public.tasks t
  LEFT JOIN (
    SELECT task_id, SUM(duration_minutes)::numeric / 60.0 AS logged_hours
    FROM public.time_entries
    WHERE duration_minutes IS NOT NULL
    GROUP BY task_id
  ) te ON te.task_id = t.id
  WHERE t.project_id = p_project_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_time_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_time_health(uuid) TO service_role;

-- 3) Aggregated RPC for a whole workspace (one row per project)
CREATE OR REPLACE FUNCTION public.get_workspace_project_health(p_workspace_id uuid)
RETURNS TABLE(project_id uuid, estimate_hours numeric, logged_hours numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id AS project_id,
    COALESCE(SUM(COALESCE(t.total_effort_hours, 0)), 0)::numeric(12,2) AS estimate_hours,
    COALESCE(SUM(COALESCE(te.logged_hours, 0)), 0)::numeric(12,2) AS logged_hours
  FROM public.projects p
  LEFT JOIN public.tasks t ON t.project_id = p.id
  LEFT JOIN (
    SELECT task_id, SUM(duration_minutes)::numeric / 60.0 AS logged_hours
    FROM public.time_entries
    WHERE duration_minutes IS NOT NULL
    GROUP BY task_id
  ) te ON te.task_id = t.id
  WHERE p.workspace_id = p_workspace_id
  GROUP BY p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_project_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_project_health(uuid) TO service_role;
