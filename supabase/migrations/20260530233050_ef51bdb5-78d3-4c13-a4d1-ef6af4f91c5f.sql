
-- Make user_id optional so estimates can target a role placeholder
ALTER TABLE public.task_estimates ALTER COLUMN user_id DROP NOT NULL;

-- Add optional role column referencing the workspace_role enum
ALTER TABLE public.task_estimates ADD COLUMN IF NOT EXISTS role public.workspace_role;

-- Exactly one of (user_id, role) must be set
ALTER TABLE public.task_estimates
  DROP CONSTRAINT IF EXISTS task_estimates_user_xor_role;
ALTER TABLE public.task_estimates
  ADD CONSTRAINT task_estimates_user_xor_role
  CHECK ((user_id IS NOT NULL) <> (role IS NOT NULL));

-- Prevent duplicate placeholders for the same (task, role)
CREATE UNIQUE INDEX IF NOT EXISTS task_estimates_task_role_uniq
  ON public.task_estimates(task_id, role)
  WHERE role IS NOT NULL;
