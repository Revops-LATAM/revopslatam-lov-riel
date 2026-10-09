CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON public.tasks (project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_started ON public.time_entries (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_started ON public.time_entries (task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_estimates_task_user ON public.task_estimates (task_id, user_id);