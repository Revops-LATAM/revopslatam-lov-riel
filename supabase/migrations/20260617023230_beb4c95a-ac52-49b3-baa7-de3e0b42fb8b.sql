
CREATE OR REPLACE FUNCTION public.enforce_backlog_task_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ctype public.contract_type;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
  IF ctype <> 'recurrente' THEN
    RETURN NEW;
  END IF;

  IF NEW.sprint_id IS NULL THEN
    IF NEW.status NOT IN ('nueva','cancelada') THEN
      NEW.status := 'nueva';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_backlog_task_status_trg ON public.tasks;
CREATE TRIGGER enforce_backlog_task_status_trg
BEFORE INSERT OR UPDATE OF sprint_id, status, contract_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_backlog_task_status();

-- Backfill
UPDATE public.tasks t
   SET status = 'nueva'
  FROM public.contracts c
 WHERE t.contract_id = c.id
   AND c.type = 'recurrente'
   AND t.sprint_id IS NULL
   AND t.status NOT IN ('nueva','cancelada');
