
-- 1. Add internal_hourly_cost for profitability
ALTER TABLE public.contract_financials
  ADD COLUMN IF NOT EXISTS internal_hourly_cost numeric(10,2);

-- 2. Currency rates table (manual fx)
CREATE TABLE IF NOT EXISTS public.currency_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  currency text NOT NULL,
  base_currency text NOT NULL DEFAULT 'USD',
  rate_to_base numeric(18,6) NOT NULL CHECK (rate_to_base > 0),
  rate_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, currency, rate_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.currency_rates TO authenticated;
GRANT ALL ON public.currency_rates TO service_role;

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "currency_rates_select_members"
  ON public.currency_rates FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "currency_rates_write_admins"
  ON public.currency_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE POLICY "currency_rates_update_admins"
  ON public.currency_rates FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE POLICY "currency_rates_delete_admins"
  ON public.currency_rates FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER currency_rates_updated_at
  BEFORE UPDATE ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Auto-generate sprints for a contract
CREATE OR REPLACE FUNCTION public.generate_contract_sprints(
  _contract_id uuid,
  _sprint_days int,
  _hours_per_sprint numeric
) RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  cur_start date;
  cur_end date;
  end_d date;
  next_n int;
  created_count int := 0;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF _sprint_days IS NULL OR _sprint_days <= 0 THEN RETURN 0; END IF;

  end_d := COALESCE(c.end_date, (c.start_date + interval '12 months')::date);

  -- Remove planned (not started) sprints to avoid duplicates
  DELETE FROM public.sprints
   WHERE contract_id = _contract_id AND status = 'planned';

  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n
    FROM public.sprints WHERE contract_id = _contract_id;

  cur_start := c.start_date;
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST((cur_start + (_sprint_days - 1) * INTERVAL '1 day')::date, end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, next_n, cur_start, cur_end, COALESCE(_hours_per_sprint, 0), 'planned');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;

  RETURN created_count;
END;
$$;
