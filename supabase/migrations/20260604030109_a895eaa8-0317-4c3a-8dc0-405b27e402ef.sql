
-- =========================================================
-- 1. ENUMS
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.workspace_kind AS ENUM ('internal','operations');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_type AS ENUM ('implementation','recurrente','hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_status AS ENUM ('draft','active','paused','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_billing_model AS ENUM ('fixed','monthly','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_schedule_type AS ENUM ('monthly_fixed','per_milestone','mixed','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sprint_status AS ENUM ('planned','active','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.phase_status AS ENUM ('planned','in_progress','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.milestone_status AS ENUM ('pending','achieved','invoiced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('scheduled','invoiced','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_kind AS ENUM ('monthly','milestone','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 2. WORKSPACES: add kind + seed Interno/Operaciones
-- =========================================================
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS kind public.workspace_kind NOT NULL DEFAULT 'internal';

-- Rename existing workspace(s) to Interno (only if user has just the default one).
-- We only auto-rename the seed when slug = 'pablo' to avoid clobbering deliberate names.
UPDATE public.workspaces
  SET name = 'Interno', slug = 'interno', kind = 'internal'
  WHERE slug = 'pablo';

-- Create Operaciones workspace per owner that has at least one workspace,
-- only if they don't already have an operations one.
INSERT INTO public.workspaces (name, slug, owner_id, kind, color)
SELECT 'Operaciones',
       'operaciones-' || substr(w.owner_id::text, 1, 8),
       w.owner_id,
       'operations',
       '#0ea5e9'
FROM (SELECT DISTINCT owner_id FROM public.workspaces) w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspaces w2
  WHERE w2.owner_id = w.owner_id AND w2.kind = 'operations'
);

-- Friendly slug for the very first operations workspace
UPDATE public.workspaces SET slug = 'operaciones'
WHERE kind = 'operations'
  AND id = (SELECT id FROM public.workspaces WHERE kind='operations' ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE slug = 'operaciones' AND kind <> 'operations');

-- =========================================================
-- 3. ACCOUNTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  status public.account_status NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  website text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_accounts_workspace ON public.accounts(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_select_members ON public.accounts FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY accounts_insert_members ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(),
    ARRAY['owner','admin','member']::workspace_role[]));
CREATE POLICY accounts_update_members ON public.accounts FOR UPDATE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(),
    ARRAY['owner','admin','member']::workspace_role[]));
CREATE POLICY accounts_delete_admins ON public.accounts FOR DELETE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(),
    ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 4. CONTRACTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  type public.contract_type NOT NULL,
  billing_model public.contract_billing_model NOT NULL DEFAULT 'fixed',
  status public.contract_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  start_date date NOT NULL,
  end_date date,
  owner_consultant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sprint_duration_days integer,
  payment_schedule_type public.payment_schedule_type NOT NULL DEFAULT 'none',
  payment_schedule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contracts_sprint_duration_chk CHECK (
    (type = 'implementation' AND sprint_duration_days IS NULL)
    OR (type IN ('recurrente','hybrid') AND sprint_duration_days IS NOT NULL AND sprint_duration_days > 0)
  ),
  CONSTRAINT contracts_dates_chk CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_contracts_account ON public.contracts(account_id);
CREATE INDEX IF NOT EXISTS idx_contracts_workspace ON public.contracts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select_members ON public.contracts FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY contracts_insert_members ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (app_private.has_workspace_role(workspace_id, auth.uid(),
    ARRAY['owner','admin','member']::workspace_role[]));
CREATE POLICY contracts_update_members ON public.contracts FOR UPDATE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(),
    ARRAY['owner','admin','member']::workspace_role[]));
CREATE POLICY contracts_delete_admins ON public.contracts FOR DELETE TO authenticated
  USING (app_private.has_workspace_role(workspace_id, auth.uid(),
    ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 5. CONTRACT_FINANCIALS (sensitive, 1:1)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.contract_financials (
  contract_id uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  fee_total numeric(14,2),
  monthly_fee numeric(14,2),
  contracted_hours_total numeric(10,2),
  hourly_rate numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_financials TO authenticated;
GRANT ALL ON public.contract_financials TO service_role;

ALTER TABLE public.contract_financials ENABLE ROW LEVEL SECURITY;

-- Helper inline via subquery — admins/owner of the contract's workspace only.
CREATE POLICY financials_select_admins ON public.contract_financials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
        ARRAY['owner','admin']::workspace_role[])
  ));
CREATE POLICY financials_insert_admins ON public.contract_financials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
        ARRAY['owner','admin']::workspace_role[])
  ));
CREATE POLICY financials_update_admins ON public.contract_financials FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
        ARRAY['owner','admin']::workspace_role[])
  ));
CREATE POLICY financials_delete_admins ON public.contract_financials FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
        ARRAY['owner','admin']::workspace_role[])
  ));

CREATE TRIGGER contract_financials_updated_at BEFORE UPDATE ON public.contract_financials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 6. PROJECTS: add contract_id
-- =========================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_contract ON public.projects(contract_id);

-- =========================================================
-- 7. PHASES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  status public.phase_status NOT NULL DEFAULT 'planned',
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phases_project ON public.phases(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phases TO authenticated;
GRANT ALL ON public.phases TO service_role;
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY phases_select ON public.phases FOR SELECT TO authenticated
  USING (app_private.can_access_project(project_id, auth.uid()));
CREATE POLICY phases_insert ON public.phases FOR INSERT TO authenticated
  WITH CHECK (app_private.can_edit_project(project_id, auth.uid()));
CREATE POLICY phases_update ON public.phases FOR UPDATE TO authenticated
  USING (app_private.can_edit_project(project_id, auth.uid()));
CREATE POLICY phases_delete ON public.phases FOR DELETE TO authenticated
  USING (app_private.can_edit_project(project_id, auth.uid()));

CREATE TRIGGER phases_updated_at BEFORE UPDATE ON public.phases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 8. SPRINTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  sprint_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.sprint_status NOT NULL DEFAULT 'planned',
  contracted_hours numeric(8,2) NOT NULL DEFAULT 0,
  holidays_in jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, sprint_number),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_sprints_contract ON public.sprints(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sprints TO authenticated;
GRANT ALL ON public.sprints TO service_role;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY sprints_select ON public.sprints FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND app_private.is_workspace_member(c.workspace_id, auth.uid())));
CREATE POLICY sprints_write ON public.sprints FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
      ARRAY['owner','admin','member']::workspace_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
      ARRAY['owner','admin','member']::workspace_role[])));

CREATE TRIGGER sprints_updated_at BEFORE UPDATE ON public.sprints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 9. MILESTONES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  due_date date,
  is_billable_event boolean NOT NULL DEFAULT false,
  amount numeric(14,2),
  status public.milestone_status NOT NULL DEFAULT 'pending',
  achieved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON public.milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_phase ON public.milestones(phase_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY milestones_select ON public.milestones FOR SELECT TO authenticated
  USING (app_private.can_access_project(project_id, auth.uid()));
CREATE POLICY milestones_write ON public.milestones FOR ALL TO authenticated
  USING (app_private.can_edit_project(project_id, auth.uid()))
  WITH CHECK (app_private.can_edit_project(project_id, auth.uid()));

CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mark achieved_at on status transition
CREATE OR REPLACE FUNCTION public.handle_milestone_achievement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'achieved' AND (OLD.status IS DISTINCT FROM 'achieved') AND NEW.achieved_at IS NULL THEN
    NEW.achieved_at := now();
  ELSIF NEW.status = 'pending' THEN
    NEW.achieved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER milestones_achievement BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.handle_milestone_achievement();

-- =========================================================
-- 10. CONTRACT_PAYMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.milestones(id) ON DELETE SET NULL,
  kind public.payment_kind NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  due_date date NOT NULL,
  paid_at timestamptz,
  status public.payment_status NOT NULL DEFAULT 'scheduled',
  period_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON public.contract_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_milestone ON public.contract_payments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_payments_due ON public.contract_payments(due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON public.contract_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND app_private.is_workspace_member(c.workspace_id, auth.uid())));
CREATE POLICY payments_write ON public.contract_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
      ARRAY['owner','admin','member']::workspace_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
      ARRAY['owner','admin','member']::workspace_role[])));

CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.contract_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 11. TASKS: contract / sprint / phase columns + validation trigger
-- =========================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contract ON public.tasks(contract_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON public.tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON public.tasks(phase_id);

CREATE OR REPLACE FUNCTION public.validate_task_anchors()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  ws_kind public.workspace_kind;
  ctype public.contract_type;
BEGIN
  SELECT w.kind INTO ws_kind
    FROM public.projects p
    JOIN public.workspaces w ON w.id = p.workspace_id
    WHERE p.id = NEW.project_id;

  IF ws_kind = 'operations' THEN
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'tasks in Operaciones workspace require contract_id';
    END IF;
    SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF ctype = 'implementation' AND NEW.sprint_id IS NOT NULL THEN
      RAISE EXCEPTION 'implementation contract tasks cannot have sprint_id';
    END IF;
    IF ctype = 'recurrente' AND NEW.phase_id IS NOT NULL THEN
      RAISE EXCEPTION 'recurrente contract tasks cannot have phase_id';
    END IF;
  ELSE
    -- internal: no contract anchors
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    NEW.phase_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_validate_anchors ON public.tasks;
CREATE TRIGGER tasks_validate_anchors BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_task_anchors();

-- =========================================================
-- 12. AUTOGEN: monthly payments for contracts
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_contract_monthly_payments(_contract_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c public.contracts%ROWTYPE;
  cur_date date;
  end_d date;
  fee numeric(14,2);
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.payment_schedule_type <> 'monthly_fixed' AND c.payment_schedule_type <> 'mixed' THEN
    RETURN;
  END IF;

  SELECT cf.monthly_fee INTO fee FROM public.contract_financials cf WHERE cf.contract_id = _contract_id;
  IF fee IS NULL OR fee <= 0 THEN RETURN; END IF;

  -- Remove future scheduled monthly payments not yet paid/invoiced
  DELETE FROM public.contract_payments
   WHERE contract_id = _contract_id
     AND kind = 'monthly'
     AND status = 'scheduled';

  cur_date := date_trunc('month', c.start_date)::date;
  end_d := COALESCE(c.end_date, (c.start_date + interval '12 months')::date);

  WHILE cur_date <= end_d LOOP
    INSERT INTO public.contract_payments
      (contract_id, kind, amount, currency, due_date, status, period_label)
    VALUES
      (_contract_id, 'monthly', fee, c.currency,
       (cur_date + interval '1 month - 1 day')::date,
       'scheduled',
       to_char(cur_date, 'YYYY-MM'));
    cur_date := (cur_date + interval '1 month')::date;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_contract_payment_schedule()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR
     NEW.payment_schedule_type IS DISTINCT FROM OLD.payment_schedule_type OR
     NEW.start_date IS DISTINCT FROM OLD.start_date OR
     NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    PERFORM public.generate_contract_monthly_payments(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_payment_schedule ON public.contracts;
CREATE TRIGGER contracts_payment_schedule AFTER INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_contract_payment_schedule();

-- Regenerate when monthly_fee changes in financials
CREATE OR REPLACE FUNCTION public.handle_financials_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.monthly_fee IS DISTINCT FROM OLD.monthly_fee THEN
    PERFORM public.generate_contract_monthly_payments(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financials_regenerate_payments ON public.contract_financials;
CREATE TRIGGER financials_regenerate_payments AFTER INSERT OR UPDATE ON public.contract_financials
  FOR EACH ROW EXECUTE FUNCTION public.handle_financials_change();

-- =========================================================
-- 13. AUTOGEN: milestone billable payment
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_milestone_billing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cid uuid;
  cur text;
BEGIN
  IF NEW.is_billable_event AND COALESCE(NEW.amount, 0) > 0 THEN
    -- find contract through project
    SELECT p.contract_id, c.currency INTO cid, cur
      FROM public.projects p
      LEFT JOIN public.contracts c ON c.id = p.contract_id
      WHERE p.id = NEW.project_id;

    IF cid IS NULL THEN RETURN NEW; END IF;

    -- Upsert payment for this milestone
    IF EXISTS (SELECT 1 FROM public.contract_payments WHERE milestone_id = NEW.id) THEN
      UPDATE public.contract_payments
        SET amount = NEW.amount,
            due_date = COALESCE(NEW.due_date, due_date),
            currency = COALESCE(cur, currency)
      WHERE milestone_id = NEW.id AND status = 'scheduled';
    ELSE
      INSERT INTO public.contract_payments
        (contract_id, milestone_id, kind, amount, currency, due_date, status)
      VALUES
        (cid, NEW.id, 'milestone', NEW.amount, COALESCE(cur, 'USD'),
         COALESCE(NEW.due_date, CURRENT_DATE), 'scheduled');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS milestones_billing ON public.milestones;
CREATE TRIGGER milestones_billing AFTER INSERT OR UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.handle_milestone_billing();
