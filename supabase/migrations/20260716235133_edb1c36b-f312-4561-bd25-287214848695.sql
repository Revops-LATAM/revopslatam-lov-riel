ALTER TABLE public.task_comments ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.task_comments DROP CONSTRAINT IF EXISTS task_comments_author_present;
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_author_present
  CHECK (author_id IS NOT NULL OR client_author_email IS NOT NULL);