-- =========================
-- PARTNERS
-- =========================
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text,
  billing_entity text,
  external_billing_system text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view partners"
  ON public.partners FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage partners"
  ON public.partners FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER partners_set_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ACCOUNTS: partner_id
-- =========================
ALTER TABLE public.accounts
  ADD COLUMN partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX idx_accounts_partner_id ON public.accounts(partner_id) WHERE partner_id IS NOT NULL;

-- =========================
-- PROJECTS: billing_mode, partner_id, asana_project_gid
-- =========================
CREATE TYPE public.project_billing_mode AS ENUM ('internal', 'partner', 'internal_no_contract');

ALTER TABLE public.projects
  ADD COLUMN billing_mode public.project_billing_mode NOT NULL DEFAULT 'internal',
  ADD COLUMN partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN asana_project_gid text;

CREATE INDEX idx_projects_partner_id ON public.projects(partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX idx_projects_billing_mode ON public.projects(billing_mode);
CREATE UNIQUE INDEX idx_projects_asana_gid ON public.projects(workspace_id, asana_project_gid) WHERE asana_project_gid IS NOT NULL;

-- Backfill: projects que ya tienen contract_id quedan en 'internal'; los que no, en 'internal_no_contract'
UPDATE public.projects SET billing_mode = 'internal_no_contract' WHERE contract_id IS NULL;

-- Validación: partner projects no pueden tener contract_id; internal con contrato debe tener contract_id
CREATE OR REPLACE FUNCTION public.validate_project_billing_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.billing_mode = 'partner' THEN
    IF NEW.partner_id IS NULL THEN
      RAISE EXCEPTION 'partner projects require partner_id';
    END IF;
    NEW.contract_id := NULL;
  ELSIF NEW.billing_mode = 'internal' THEN
    NEW.partner_id := NULL;
  ELSIF NEW.billing_mode = 'internal_no_contract' THEN
    NEW.partner_id := NULL;
    NEW.contract_id := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER projects_validate_billing_mode
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_billing_mode();

-- =========================
-- ASANA CONNECTIONS (por workspace)
-- =========================
CREATE TABLE public.asana_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asana_workspace_gid text NOT NULL,
  asana_workspace_name text,
  default_team_gid text,
  webhook_secret text,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_connections TO authenticated;
GRANT ALL ON public.asana_connections TO service_role;
ALTER TABLE public.asana_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana connection"
  ON public.asana_connections FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana connection"
  ON public.asana_connections FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_connections_set_updated_at
  BEFORE UPDATE ON public.asana_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ASANA PROJECT LINKS
-- =========================
CREATE TYPE public.asana_sync_status AS ENUM ('idle', 'syncing', 'error', 'paused');

CREATE TABLE public.asana_project_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  asana_project_gid text NOT NULL,
  asana_workspace_gid text NOT NULL,
  asana_webhook_gid text,
  sync_status public.asana_sync_status NOT NULL DEFAULT 'idle',
  last_sync_at timestamptz,
  last_error text,
  initial_import_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, asana_project_gid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_project_links TO authenticated;
GRANT ALL ON public.asana_project_links TO service_role;
ALTER TABLE public.asana_project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana project links"
  ON public.asana_project_links FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana project links"
  ON public.asana_project_links FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_project_links_set_updated_at
  BEFORE UPDATE ON public.asana_project_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ASANA USER MAP
-- =========================
CREATE TABLE public.asana_user_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asana_user_gid text NOT NULL,
  asana_user_email text,
  asana_user_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, asana_user_gid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_user_map TO authenticated;
GRANT ALL ON public.asana_user_map TO service_role;
ALTER TABLE public.asana_user_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana user map"
  ON public.asana_user_map FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana user map"
  ON public.asana_user_map FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_user_map_set_updated_at
  BEFORE UPDATE ON public.asana_user_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ASANA TASK MAP
-- =========================
CREATE TABLE public.asana_task_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL UNIQUE REFERENCES public.tasks(id) ON DELETE CASCADE,
  asana_task_gid text NOT NULL,
  asana_project_gid text NOT NULL,
  last_synced_hash text,
  last_synced_at timestamptz,
  last_source text NOT NULL DEFAULT 'asana',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, asana_task_gid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_task_map TO authenticated;
GRANT ALL ON public.asana_task_map TO service_role;
ALTER TABLE public.asana_task_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana task map"
  ON public.asana_task_map FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana task map"
  ON public.asana_task_map FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_task_map_set_updated_at
  BEFORE UPDATE ON public.asana_task_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ASANA STATUS MAP (Asana section/custom-field-value ↔ Riel status)
-- =========================
CREATE TABLE public.asana_status_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asana_project_gid text NOT NULL,
  asana_value text NOT NULL,
  asana_value_label text,
  status_id uuid NOT NULL REFERENCES public.task_statuses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, asana_project_gid, asana_value)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_status_map TO authenticated;
GRANT ALL ON public.asana_status_map TO service_role;
ALTER TABLE public.asana_status_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana status map"
  ON public.asana_status_map FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana status map"
  ON public.asana_status_map FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_status_map_set_updated_at
  BEFORE UPDATE ON public.asana_status_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ASANA SYNC QUEUE
-- =========================
CREATE TABLE public.asana_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  direction text NOT NULL,  -- 'asana_to_riel' | 'riel_to_asana'
  resource_kind text NOT NULL, -- 'task' | 'comment' | 'project'
  asana_gid text,
  riel_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'done' | 'failed'
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_asana_sync_queue_pending
  ON public.asana_sync_queue(next_attempt_at)
  WHERE status = 'pending';

GRANT SELECT ON public.asana_sync_queue TO authenticated;
GRANT ALL ON public.asana_sync_queue TO service_role;
ALTER TABLE public.asana_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana sync queue"
  ON public.asana_sync_queue FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER asana_sync_queue_set_updated_at
  BEFORE UPDATE ON public.asana_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();