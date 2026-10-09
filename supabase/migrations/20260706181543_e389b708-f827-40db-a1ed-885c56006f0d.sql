
-- 1) Add portion column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_holidays' AND column_name='portion') THEN
    ALTER TABLE public.workspace_holidays ADD COLUMN portion text NOT NULL DEFAULT 'full';
    ALTER TABLE public.workspace_holidays ADD CONSTRAINT workspace_holidays_portion_chk CHECK (portion IN ('full','am','pm'));
  END IF;
END $$;

-- 2) Replace unique index to include portion
DROP INDEX IF EXISTS public.workspace_holidays_uniq;
CREATE UNIQUE INDEX workspace_holidays_uniq
  ON public.workspace_holidays (workspace_id, date, affects, portion, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 3) Update is_non_working_day to only count full-day entries
CREATE OR REPLACE FUNCTION public.is_non_working_day(_workspace_id uuid, _user_id uuid, _date date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dow int;
BEGIN
  IF _date IS NULL THEN RETURN false; END IF;
  dow := EXTRACT(ISODOW FROM _date);
  IF dow IN (6,7) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1
      FROM public.workspace_holidays h
     WHERE h.workspace_id = _workspace_id
       AND h.date = _date
       AND COALESCE(h.portion,'full') = 'full'
       AND (
         h.affects = 'all'
         OR (h.affects = 'user' AND _user_id IS NOT NULL AND h.user_id = _user_id)
       )
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END $$;
