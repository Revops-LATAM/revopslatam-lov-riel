-- =====================================================
-- MARKETING SPACE — FOUNDATION
-- =====================================================

CREATE TYPE public.campaign_status AS ENUM (
  'idea', 'planning', 'in_execution', 'live', 'measuring', 'closed'
);

CREATE TYPE public.content_piece_status AS ENUM (
  'idea', 'draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'
);

-- marketing_channels
CREATE TABLE public.marketing_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ec4899',
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_channels TO authenticated;
GRANT ALL ON public.marketing_channels TO service_role;

ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_channels_view"
  ON public.marketing_channels FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "marketing_channels_manage"
  ON public.marketing_channels FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission));

-- campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  objective TEXT,
  brief_md TEXT,
  kpi_label TEXT,
  kpi_target NUMERIC,
  kpi_actual NUMERIC,
  launch_date DATE,
  end_date DATE,
  budget NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  channels TEXT[] NOT NULL DEFAULT '{}',
  status public.campaign_status NOT NULL DEFAULT 'idea',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  color TEXT NOT NULL DEFAULT '#ec4899',
  hubspot_campaign_id TEXT,
  hubspot_last_sync_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_workspace ON public.campaigns(workspace_id) WHERE archived = false;
CREATE INDEX idx_campaigns_launch ON public.campaigns(workspace_id, launch_date);
CREATE INDEX idx_campaigns_hubspot ON public.campaigns(hubspot_campaign_id) WHERE hubspot_campaign_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_view"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    public.has_permission(workspace_id, auth.uid(), 'marketing_view'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission)
  );

CREATE POLICY "campaigns_manage"
  ON public.campaigns FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission));

-- content_pieces
CREATE TABLE public.content_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body_md TEXT,
  channel TEXT NOT NULL,
  format TEXT,
  publish_at TIMESTAMPTZ,
  status_editorial public.content_piece_status NOT NULL DEFAULT 'idea',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  url_published TEXT,
  color TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_pieces_workspace ON public.content_pieces(workspace_id);
CREATE INDEX idx_content_pieces_campaign ON public.content_pieces(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_content_pieces_publish_at ON public.content_pieces(workspace_id, publish_at);
CREATE INDEX idx_content_pieces_owner ON public.content_pieces(owner_id) WHERE owner_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pieces TO authenticated;
GRANT ALL ON public.content_pieces TO service_role;

ALTER TABLE public.content_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_pieces_view"
  ON public.content_pieces FOR SELECT TO authenticated
  USING (
    public.has_permission(workspace_id, auth.uid(), 'marketing_view'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission)
  );

CREATE POLICY "content_pieces_manage"
  ON public.content_pieces FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission));

-- campaign_templates
CREATE TABLE public.campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_channels TEXT[] NOT NULL DEFAULT '{}',
  default_status public.campaign_status NOT NULL DEFAULT 'planning',
  default_duration_days INTEGER NOT NULL DEFAULT 30,
  pieces_json JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_templates_workspace ON public.campaign_templates(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_templates TO authenticated;
GRANT ALL ON public.campaign_templates TO service_role;

ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_templates_view"
  ON public.campaign_templates FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR public.has_permission(workspace_id, auth.uid(), 'marketing_view'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission)
  );

CREATE POLICY "campaign_templates_manage_workspace"
  ON public.campaign_templates FOR ALL TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission))
  WITH CHECK (workspace_id IS NOT NULL AND public.has_permission(workspace_id, auth.uid(), 'marketing_manage'::public.workspace_permission));

CREATE POLICY "campaign_templates_manage_global_super"
  ON public.campaign_templates FOR ALL TO authenticated
  USING (workspace_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (workspace_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Extend time_entries for direct piece logging
ALTER TABLE public.time_entries
  ADD COLUMN content_piece_id UUID REFERENCES public.content_pieces(id) ON DELETE SET NULL;

CREATE INDEX idx_time_entries_content_piece ON public.time_entries(content_piece_id) WHERE content_piece_id IS NOT NULL;

ALTER TABLE public.time_entries ALTER COLUMN task_id DROP NOT NULL;

ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_target_check
  CHECK (task_id IS NOT NULL OR content_piece_id IS NOT NULL);

-- updated_at triggers (uses existing public.set_updated_at)
CREATE TRIGGER set_marketing_channels_updated_at
  BEFORE UPDATE ON public.marketing_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_content_pieces_updated_at
  BEFORE UPDATE ON public.content_pieces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_campaign_templates_updated_at
  BEFORE UPDATE ON public.campaign_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed marketing_channels for new workspaces
CREATE OR REPLACE FUNCTION public.seed_marketing_channels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.marketing_channels (workspace_id, key, label, color, sort_order) VALUES
    (NEW.id, 'linkedin',    'LinkedIn',       '#0a66c2', 10),
    (NEW.id, 'blog',        'Blog',           '#8b5cf6', 20),
    (NEW.id, 'newsletter',  'Newsletter',     '#f59e0b', 30),
    (NEW.id, 'instagram',   'Instagram',      '#e1306c', 40),
    (NEW.id, 'youtube',     'YouTube',        '#ff0000', 50),
    (NEW.id, 'podcast',     'Podcast',        '#a855f7', 60),
    (NEW.id, 'webinar',     'Webinar',        '#10b981', 70),
    (NEW.id, 'paid_ads',    'Paid Ads',       '#ef4444', 80),
    (NEW.id, 'email_out',   'Email outbound', '#3b82f6', 90),
    (NEW.id, 'event',       'Evento',         '#14b8a6', 100)
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_workspace_created_seed_marketing_channels
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_marketing_channels();

-- Backfill existing workspaces
INSERT INTO public.marketing_channels (workspace_id, key, label, color, sort_order)
SELECT w.id, c.key, c.label, c.color, c.sort_order
FROM public.workspaces w
CROSS JOIN (VALUES
  ('linkedin',    'LinkedIn',       '#0a66c2', 10),
  ('blog',        'Blog',           '#8b5cf6', 20),
  ('newsletter',  'Newsletter',     '#f59e0b', 30),
  ('instagram',   'Instagram',      '#e1306c', 40),
  ('youtube',     'YouTube',        '#ff0000', 50),
  ('podcast',     'Podcast',        '#a855f7', 60),
  ('webinar',     'Webinar',        '#10b981', 70),
  ('paid_ads',    'Paid Ads',       '#ef4444', 80),
  ('email_out',   'Email outbound', '#3b82f6', 90),
  ('event',       'Evento',         '#14b8a6', 100)
) AS c(key, label, color, sort_order)
ON CONFLICT (workspace_id, key) DO NOTHING;

-- Seed 5 global campaign templates
INSERT INTO public.campaign_templates (workspace_id, name, description, default_channels, default_status, default_duration_days, pieces_json, is_system, sort_order) VALUES
(NULL, 'Lanzamiento de producto',
 'Anuncio y activación de un nuevo producto/servicio en múltiples canales.',
 ARRAY['linkedin','blog','newsletter','email_out'],
 'planning', 45,
 '[
   {"title":"Blog: anuncio del lanzamiento","channel":"blog","format":"articulo","offset_days":0,"status_editorial":"draft"},
   {"title":"Post LinkedIn: teaser","channel":"linkedin","format":"post","offset_days":-7,"status_editorial":"idea"},
   {"title":"Post LinkedIn: día del lanzamiento","channel":"linkedin","format":"post","offset_days":0,"status_editorial":"draft"},
   {"title":"Email a base: anuncio","channel":"newsletter","format":"email","offset_days":0,"status_editorial":"draft"},
   {"title":"Email outbound: alcance directo","channel":"email_out","format":"email","offset_days":1,"status_editorial":"draft"},
   {"title":"Post LinkedIn: caso de uso","channel":"linkedin","format":"post","offset_days":7,"status_editorial":"idea"},
   {"title":"Post LinkedIn: testimonio cliente","channel":"linkedin","format":"post","offset_days":21,"status_editorial":"idea"}
 ]'::jsonb, true, 10),

(NULL, 'Webinar',
 'Organizar y promocionar un webinar en vivo, con seguimiento post-evento.',
 ARRAY['linkedin','newsletter','email_out','webinar'],
 'planning', 30,
 '[
   {"title":"Landing del webinar","channel":"blog","format":"landing","offset_days":-21,"status_editorial":"draft"},
   {"title":"Post LinkedIn: anuncio","channel":"linkedin","format":"post","offset_days":-21,"status_editorial":"idea"},
   {"title":"Email: invitación","channel":"newsletter","format":"email","offset_days":-14,"status_editorial":"draft"},
   {"title":"Post LinkedIn: agenda + speakers","channel":"linkedin","format":"post","offset_days":-10,"status_editorial":"idea"},
   {"title":"Email: recordatorio 3 días","channel":"newsletter","format":"email","offset_days":-3,"status_editorial":"idea"},
   {"title":"Post LinkedIn: hoy es el día","channel":"linkedin","format":"post","offset_days":0,"status_editorial":"idea"},
   {"title":"Webinar en vivo","channel":"webinar","format":"live","offset_days":0,"status_editorial":"scheduled"},
   {"title":"Email: gracias + grabación","channel":"newsletter","format":"email","offset_days":1,"status_editorial":"idea"},
   {"title":"Post LinkedIn: highlights + recording","channel":"linkedin","format":"post","offset_days":2,"status_editorial":"idea"}
 ]'::jsonb, true, 20),

(NULL, 'Newsletter mensual',
 'Edición mensual de newsletter con curación de contenido y llamados a la acción.',
 ARRAY['newsletter','linkedin'],
 'planning', 7,
 '[
   {"title":"Newsletter — edición del mes","channel":"newsletter","format":"email","offset_days":0,"status_editorial":"draft"},
   {"title":"Post LinkedIn: highlight del newsletter","channel":"linkedin","format":"post","offset_days":1,"status_editorial":"idea"}
 ]'::jsonb, true, 30),

(NULL, 'Contenido evergreen',
 'Producir una pieza pilar (blog/guía) y clusterizar en formatos derivados.',
 ARRAY['blog','linkedin','youtube'],
 'planning', 45,
 '[
   {"title":"Blog pilar: guía completa","channel":"blog","format":"articulo","offset_days":0,"status_editorial":"draft"},
   {"title":"Video YouTube derivado","channel":"youtube","format":"video","offset_days":3,"status_editorial":"idea"},
   {"title":"Post LinkedIn: hilo con puntos clave","channel":"linkedin","format":"post","offset_days":1,"status_editorial":"idea"},
   {"title":"Post LinkedIn: cita destacada","channel":"linkedin","format":"post","offset_days":7,"status_editorial":"idea"},
   {"title":"Post LinkedIn: caso práctico","channel":"linkedin","format":"post","offset_days":14,"status_editorial":"idea"},
   {"title":"Post LinkedIn: myth vs fact","channel":"linkedin","format":"post","offset_days":21,"status_editorial":"idea"}
 ]'::jsonb, true, 40),

(NULL, 'Serie LinkedIn',
 'Serie de 5 posts en LinkedIn con narrativa continua durante 2 semanas.',
 ARRAY['linkedin'],
 'planning', 14,
 '[
   {"title":"Post 1 — problema / gancho","channel":"linkedin","format":"post","offset_days":0,"status_editorial":"idea"},
   {"title":"Post 2 — contexto / data","channel":"linkedin","format":"post","offset_days":3,"status_editorial":"idea"},
   {"title":"Post 3 — solución / marco","channel":"linkedin","format":"post","offset_days":6,"status_editorial":"idea"},
   {"title":"Post 4 — caso / prueba","channel":"linkedin","format":"post","offset_days":10,"status_editorial":"idea"},
   {"title":"Post 5 — cierre / CTA","channel":"linkedin","format":"post","offset_days":13,"status_editorial":"idea"}
 ]'::jsonb, true, 50);
