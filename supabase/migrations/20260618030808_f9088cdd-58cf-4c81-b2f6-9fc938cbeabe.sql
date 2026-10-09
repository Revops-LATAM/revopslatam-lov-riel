
-- ============================================================
-- SLAs + Client Tickets foundation
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.sla_ticket_type AS ENUM ('incidencia', 'requerimiento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sla_level AS ENUM ('normal', 'urgente_critico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SLA tables
CREATE TABLE IF NOT EXISTS public.slas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slas TO authenticated;
GRANT ALL ON public.slas TO service_role;
ALTER TABLE public.slas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slas_read_workspace" ON public.slas FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "slas_write_admin" ON public.slas FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission));

CREATE TRIGGER trg_slas_updated_at BEFORE UPDATE ON public.slas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sla_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id uuid NOT NULL REFERENCES public.slas(id) ON DELETE CASCADE,
  ticket_type public.sla_ticket_type NOT NULL,
  level public.sla_level NOT NULL,
  target_minutes integer NOT NULL CHECK (target_minutes > 0),
  business_hours boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sla_id, ticket_type, level)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_targets TO authenticated;
GRANT ALL ON public.sla_targets TO service_role;
ALTER TABLE public.sla_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla_targets_read" ON public.sla_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.slas s WHERE s.id = sla_id AND public.is_workspace_member(s.workspace_id, auth.uid())));
CREATE POLICY "sla_targets_write_admin" ON public.sla_targets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.slas s WHERE s.id = sla_id AND public.has_permission(s.workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.slas s WHERE s.id = sla_id AND public.has_permission(s.workspace_id, auth.uid(), 'admin_settings'::public.workspace_permission)));

CREATE TRIGGER trg_sla_targets_updated_at BEFORE UPDATE ON public.sla_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed function
CREATE OR REPLACE FUNCTION public.seed_workspace_slas(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normal uuid;
  v_premium uuid;
BEGIN
  INSERT INTO public.slas (workspace_id, name, is_system)
    VALUES (_workspace_id, 'Normal', true)
    ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_normal;
  INSERT INTO public.slas (workspace_id, name, is_system)
    VALUES (_workspace_id, 'Premium', true)
    ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_premium;

  -- Normal: Req. Normal 5d háb (2400 min), Req. Urgente 2d háb (960 min), Inc. Normal 24h (1440), Inc. Crítico 4h (240)
  INSERT INTO public.sla_targets (sla_id, ticket_type, level, target_minutes, business_hours) VALUES
    (v_normal, 'requerimiento', 'normal',          5*8*60, true),
    (v_normal, 'requerimiento', 'urgente_critico', 2*8*60, true),
    (v_normal, 'incidencia',    'normal',          24*60,  false),
    (v_normal, 'incidencia',    'urgente_critico', 4*60,   false)
  ON CONFLICT (sla_id, ticket_type, level) DO NOTHING;

  -- Premium: Req. Normal 2d háb, Req. Urgente 8h, Inc. Normal 8h, Inc. Crítico 1h
  INSERT INTO public.sla_targets (sla_id, ticket_type, level, target_minutes, business_hours) VALUES
    (v_premium, 'requerimiento', 'normal',          2*8*60, true),
    (v_premium, 'requerimiento', 'urgente_critico', 8*60,   false),
    (v_premium, 'incidencia',    'normal',          8*60,   false),
    (v_premium, 'incidencia',    'urgente_critico', 60,     false)
  ON CONFLICT (sla_id, ticket_type, level) DO NOTHING;
END;
$$;

-- Trigger to seed SLAs when a workspace is created
CREATE OR REPLACE FUNCTION public.handle_new_workspace_slas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_workspace_slas(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_workspace_slas ON public.workspaces;
CREATE TRIGGER trg_seed_workspace_slas AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_slas();

-- Seed SLAs for existing workspaces
DO $$
DECLARE w record;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_workspace_slas(w.id);
  END LOOP;
END $$;

-- ============================================================
-- Contracts: requires_client_tickets + sla_id
-- ============================================================
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS requires_client_tickets boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_id uuid REFERENCES public.slas(id) ON DELETE SET NULL;

-- ============================================================
-- Phases: mark ticket inbox phase
-- ============================================================
ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS is_ticket_inbox boolean NOT NULL DEFAULT false;

-- ============================================================
-- Task comments: is_client_visible flag
-- ============================================================
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT false;

-- ============================================================
-- Tasks: client ticket metadata
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS submitter_email text,
  ADD COLUMN IF NOT EXISTS request_type public.sla_ticket_type,
  ADD COLUMN IF NOT EXISTS severity public.sla_level,
  ADD COLUMN IF NOT EXISTS sla_target_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_target_resolution_at timestamptz;

-- ============================================================
-- Client ticket forms (one per project)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_ticket_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  form_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  tickets_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ticket_forms TO authenticated;
GRANT ALL ON public.client_ticket_forms TO service_role;
ALTER TABLE public.client_ticket_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctf_read_member" ON public.client_ticket_forms FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ctf_write_member" ON public.client_ticket_forms FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin','member']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin','member']::public.workspace_role[]));

CREATE TRIGGER trg_client_ticket_forms_updated_at BEFORE UPDATE ON public.client_ticket_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Authorized emails per form
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_ticket_authorized_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.client_ticket_forms(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ticket_authorized_emails TO authenticated;
GRANT ALL ON public.client_ticket_authorized_emails TO service_role;
ALTER TABLE public.client_ticket_authorized_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctae_read" ON public.client_ticket_authorized_emails FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_ticket_forms f WHERE f.id = form_id AND public.is_workspace_member(f.workspace_id, auth.uid())));
CREATE POLICY "ctae_write" ON public.client_ticket_authorized_emails FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_ticket_forms f WHERE f.id = form_id AND public.has_workspace_role(f.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin','member']::public.workspace_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_ticket_forms f WHERE f.id = form_id AND public.has_workspace_role(f.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin','member']::public.workspace_role[])));

-- ============================================================
-- Submissions audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_ticket_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.client_ticket_forms(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  submitter_email text NOT NULL,
  payload jsonb NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_ticket_submissions TO authenticated;
GRANT ALL ON public.client_ticket_submissions TO service_role;
ALTER TABLE public.client_ticket_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cts_read_member" ON public.client_ticket_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_ticket_forms f WHERE f.id = form_id AND public.is_workspace_member(f.workspace_id, auth.uid())));

CREATE INDEX IF NOT EXISTS idx_cts_form_created ON public.client_ticket_submissions(form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cts_email_created ON public.client_ticket_submissions(submitter_email, created_at DESC);

-- ============================================================
-- Allow validate_task_anchors to accept tasks in ticket-inbox phase for recurrentes
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_task_anchors()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  ctype public.contract_type;
  p_area public.area;
  ph_is_inbox boolean;
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

-- ============================================================
-- Helper: ensure ticket form + inbox phase for a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_client_ticket_form(_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_id uuid;
  v_workspace uuid;
  v_phase_id uuid;
  v_slug text;
  v_max_pos int;
  v_default_schema jsonb;
BEGIN
  SELECT id INTO v_form_id FROM public.client_ticket_forms WHERE project_id = _project_id;
  IF v_form_id IS NOT NULL THEN
    RETURN v_form_id;
  END IF;

  SELECT workspace_id INTO v_workspace FROM public.projects WHERE id = _project_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'project not found';
  END IF;

  -- Find or create ticket inbox phase
  SELECT id INTO v_phase_id FROM public.phases
    WHERE project_id = _project_id AND is_ticket_inbox = true
    LIMIT 1;

  IF v_phase_id IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_pos FROM public.phases WHERE project_id = _project_id;
    INSERT INTO public.phases (project_id, name, position, is_ticket_inbox)
    VALUES (_project_id, 'Tickets', v_max_pos, true)
    RETURNING id INTO v_phase_id;
  END IF;

  -- Generate unique slug
  LOOP
    v_slug := lower(substring(encode(gen_random_bytes(12), 'base64'), 1, 16));
    v_slug := regexp_replace(v_slug, '[^a-z0-9]', '', 'g');
    IF length(v_slug) >= 10 AND NOT EXISTS (SELECT 1 FROM public.client_ticket_forms WHERE slug = v_slug) THEN
      EXIT;
    END IF;
  END LOOP;

  v_default_schema := '{
    "areas": ["Marketing","Ventas","Servicio","Operaciones"],
    "fields": {
      "title":       {"label":"Título","required":true},
      "request_type":{"label":"Tipo de solicitud","required":true},
      "area":        {"label":"Área","required":true},
      "severity":    {"label":"Criticidad / Prioridad","required":true},
      "description": {"label":"Descripción","required":true}
    }
  }'::jsonb;

  INSERT INTO public.client_ticket_forms (workspace_id, project_id, slug, tickets_phase_id, form_schema, active)
  VALUES (v_workspace, _project_id, v_slug, v_phase_id, v_default_schema, true)
  RETURNING id INTO v_form_id;

  RETURN v_form_id;
END;
$$;
