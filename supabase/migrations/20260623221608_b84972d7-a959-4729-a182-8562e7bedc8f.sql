
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
    NEW.phase_id := NULL;
  ELSIF p_billing IN ('partner', 'internal_no_contract') THEN
    -- Partner / internal-no-contract operations projects: no contract anchors required.
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    NEW.phase_id := NULL;
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
