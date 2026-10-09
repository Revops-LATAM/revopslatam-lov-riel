
DO $$ BEGIN
  CREATE TYPE public.area AS ENUM ('operations','marketing','finance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS area public.area NOT NULL DEFAULT 'operations';
ALTER TABLE public.tasks    ADD COLUMN IF NOT EXISTS area public.area NOT NULL DEFAULT 'operations';

CREATE INDEX IF NOT EXISTS idx_projects_workspace_area ON public.projects(workspace_id, area);
CREATE INDEX IF NOT EXISTS idx_tasks_project_area      ON public.tasks(project_id, area);

CREATE OR REPLACE FUNCTION public.validate_task_anchors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  ctype public.contract_type;
  p_area public.area;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT area INTO p_area FROM public.projects WHERE id = NEW.project_id;
    IF p_area IS NOT NULL THEN
      NEW.area := p_area;
    END IF;
  END IF;

  IF NEW.area = 'marketing' THEN
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    NEW.phase_id := NULL;
  ELSE
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'tasks in operations area require contract_id';
    END IF;
    SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF ctype = 'implementation' AND NEW.sprint_id IS NOT NULL THEN
      RAISE EXCEPTION 'implementation contract tasks cannot have sprint_id';
    END IF;
    IF ctype = 'recurrente' AND NEW.phase_id IS NOT NULL THEN
      RAISE EXCEPTION 'recurrente contract tasks cannot have phase_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
