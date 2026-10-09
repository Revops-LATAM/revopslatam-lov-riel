
-- Add color + owner to phases (reused as Marketing project phases)
ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Allow marketing/internal tasks to keep phase_id when the phase belongs to
-- the task's project. Contract_id and sprint_id stay NULL for these areas.
CREATE OR REPLACE FUNCTION public.validate_task_anchors()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  ctype public.contract_type;
  p_area public.area;
  p_billing text;
  ph_is_inbox boolean;
  ph_project uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT area, billing_mode INTO p_area, p_billing FROM public.projects WHERE id = NEW.project_id;
    IF p_area IS NOT NULL THEN
      NEW.area := p_area;
    END IF;
  END IF;

  IF NEW.area IN ('marketing', 'internal') THEN
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    -- Allow phase_id for marketing/internal projects, but only phases of the same project.
    IF NEW.phase_id IS NOT NULL THEN
      SELECT project_id INTO ph_project FROM public.phases WHERE id = NEW.phase_id;
      IF ph_project IS DISTINCT FROM NEW.project_id THEN
        NEW.phase_id := NULL;
      END IF;
    END IF;
  ELSIF p_billing = 'internal_no_contract' THEN
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    IF NEW.phase_id IS NOT NULL THEN
      SELECT project_id INTO ph_project FROM public.phases WHERE id = NEW.phase_id;
      IF ph_project IS DISTINCT FROM NEW.project_id THEN
        NEW.phase_id := NULL;
      END IF;
    END IF;
  ELSE
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'tasks in operations area require contract_id';
    END IF;
    SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF NEW.phase_id IS NOT NULL THEN
      SELECT is_ticket_inbox INTO ph_is_inbox FROM public.phases WHERE id = NEW.phase_id;
    END IF;
    IF ctype = 'implementation' AND NEW.sprint_id IS NOT NULL THEN
      RAISE EXCEPTION 'implementation contract tasks cannot have sprint_id';
    END IF;
    IF ctype = 'recurrente' AND NEW.phase_id IS NOT NULL AND COALESCE(ph_is_inbox, false) = false THEN
      RAISE EXCEPTION 'recurrente contract tasks cannot have phase_id (except ticket inbox)';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
