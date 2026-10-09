-- Effort mode enum (Wrike-style)
DO $$ BEGIN
  CREATE TYPE public.task_effort_mode AS ENUM ('basic', 'flexible', 'fixed_daily', 'due_date');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS effort_mode public.task_effort_mode NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS total_effort_hours numeric(6,2);

ALTER TABLE public.task_estimates
  ADD COLUMN IF NOT EXISTS daily_hours numeric(4,2);