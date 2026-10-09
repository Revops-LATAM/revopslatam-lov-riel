
-- =========================================================
-- 1. account_access table
-- =========================================================
CREATE TABLE public.account_access (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id)
);

CREATE INDEX account_access_user_idx ON public.account_access(user_id);

GRANT SELECT, INSERT, DELETE ON public.account_access TO authenticated;
GRANT ALL ON public.account_access TO service_role;

ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;

-- Members can see grants for accounts in their workspace
CREATE POLICY account_access_select ON public.account_access
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_access.account_id
        AND public.is_workspace_member(a.workspace_id, auth.uid())
    )
  );

-- Only owner/admin/super_admin of the workspace can grant/revoke
CREATE POLICY account_access_write ON public.account_access
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_access.account_id
        AND public.has_workspace_role(
          a.workspace_id, auth.uid(),
          ARRAY['owner','admin','super_admin']::public.workspace_role[]
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_access.account_id
        AND public.has_workspace_role(
          a.workspace_id, auth.uid(),
          ARRAY['owner','admin','super_admin']::public.workspace_role[]
        )
    )
  );

-- =========================================================
-- 2. accounts.access_mode
-- =========================================================
ALTER TABLE public.accounts
  ADD COLUMN access_mode text NOT NULL DEFAULT 'restricted'
  CHECK (access_mode IN ('open','restricted'));

-- Backfill: existing accounts stay open (no visibility break)
UPDATE public.accounts SET access_mode = 'open';

-- =========================================================
-- 3. Access helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_access_account(_account_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _account_id
      AND (
        a.access_mode = 'open'
        OR public.has_workspace_role(
          a.workspace_id, _user_id,
          ARRAY['owner','admin','super_admin']::public.workspace_role[]
        )
        OR EXISTS (
          SELECT 1 FROM public.account_access aa
          WHERE aa.account_id = _account_id AND aa.user_id = _user_id
        )
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_access_account(uuid, uuid) TO authenticated;

-- Project-level convenience: true if project has no account OR account is visible
CREATE OR REPLACE FUNCTION public.project_account_visible(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.contracts c ON c.id = p.contract_id
    WHERE p.id = _project_id
      AND c.account_id IS NOT NULL
      AND NOT public.can_access_account(c.account_id, _user_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.project_account_visible(uuid, uuid) TO authenticated;

-- =========================================================
-- 4. Restrictive SELECT policies (AND-combined with existing permissive ones)
-- =========================================================
CREATE POLICY accounts_account_access_restrict
  ON public.accounts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.can_access_account(id, auth.uid()));

CREATE POLICY contracts_account_access_restrict
  ON public.contracts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (account_id IS NULL OR public.can_access_account(account_id, auth.uid()));

CREATE POLICY projects_account_access_restrict
  ON public.projects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    contract_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = projects.contract_id
        AND (c.account_id IS NULL OR public.can_access_account(c.account_id, auth.uid()))
    )
  );

CREATE POLICY handoffs_account_access_restrict
  ON public.contract_handoffs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_handoffs.contract_id
        AND (c.account_id IS NULL OR public.can_access_account(c.account_id, auth.uid()))
    )
  );

CREATE POLICY sprints_account_access_restrict
  ON public.sprints AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = sprints.contract_id
        AND (c.account_id IS NULL OR public.can_access_account(c.account_id, auth.uid()))
    )
  );

CREATE POLICY tasks_account_access_restrict
  ON public.tasks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (project_id IS NULL OR public.project_account_visible(project_id, auth.uid()));

CREATE POLICY phases_account_access_restrict
  ON public.phases AS RESTRICTIVE FOR SELECT TO authenticated
  USING (project_id IS NULL OR public.project_account_visible(project_id, auth.uid()));

CREATE POLICY milestones_account_access_restrict
  ON public.milestones AS RESTRICTIVE FOR SELECT TO authenticated
  USING (project_id IS NULL OR public.project_account_visible(project_id, auth.uid()));

-- =========================================================
-- 5. Auto-grant creator when a new restricted account is created
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_account_autogrant_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_mode = 'restricted' AND NEW.created_by IS NOT NULL THEN
    INSERT INTO public.account_access (account_id, user_id, granted_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS accounts_autogrant_creator ON public.accounts;
CREATE TRIGGER accounts_autogrant_creator
AFTER INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_account_autogrant_creator();
