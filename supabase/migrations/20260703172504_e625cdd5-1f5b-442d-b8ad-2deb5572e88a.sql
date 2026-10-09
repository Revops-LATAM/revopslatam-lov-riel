
-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.piece_format AS ENUM ('carrusel','reel','post','encuesta','demo','video');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.piece_status_v2 AS ENUM ('idea','copy','diseno','revision','programada','publicada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.piece_channel AS ENUM ('instagram','tiktok','linkedin','youtube');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.carousel_slide_role AS ENUM ('portada','contexto','punto1','punto2','punto3','cierre_cta');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.video_section AS ENUM ('hook','desarrollo','cierre');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- SHARED updated_at trigger fn (may already exist)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- content_pillars
-- ============================================================
CREATE TABLE public.content_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pillars TO authenticated;
GRANT ALL ON public.content_pillars TO service_role;
ALTER TABLE public.content_pillars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read pillars" ON public.content_pillars FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_pillars.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "members write pillars" ON public.content_pillars FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_pillars.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_pillars.workspace_id AND wm.user_id = auth.uid()));
CREATE TRIGGER tg_content_pillars_updated_at BEFORE UPDATE ON public.content_pillars FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- cadence_templates
-- ============================================================
CREATE TABLE public.cadence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadence_templates TO authenticated;
GRANT ALL ON public.cadence_templates TO service_role;
ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read templates" ON public.cadence_templates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = cadence_templates.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "members write templates" ON public.cadence_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = cadence_templates.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = cadence_templates.workspace_id AND wm.user_id = auth.uid()));
CREATE TRIGGER tg_cadence_templates_updated_at BEFORE UPDATE ON public.cadence_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- cadence_template_slots
-- ============================================================
CREATE TABLE public.cadence_template_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  time_of_day time,
  format public.piece_format NOT NULL,
  channels public.piece_channel[] NOT NULL DEFAULT '{}',
  pillar_id uuid REFERENCES public.content_pillars(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadence_template_slots TO authenticated;
GRANT ALL ON public.cadence_template_slots TO service_role;
ALTER TABLE public.cadence_template_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access slots" ON public.cadence_template_slots FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cadence_templates t
    JOIN public.workspace_members wm ON wm.workspace_id = t.workspace_id
    WHERE t.id = cadence_template_slots.template_id AND wm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cadence_templates t
    JOIN public.workspace_members wm ON wm.workspace_id = t.workspace_id
    WHERE t.id = cadence_template_slots.template_id AND wm.user_id = auth.uid()
  ));
CREATE INDEX idx_cadence_slots_template ON public.cadence_template_slots(template_id);

-- ============================================================
-- content_grids
-- ============================================================
CREATE TABLE public.content_grids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  year int NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  template_id uuid REFERENCES public.cadence_templates(id) ON DELETE SET NULL,
  notes text,
  generated_at timestamptz,
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_grids TO authenticated;
GRANT ALL ON public.content_grids TO service_role;
ALTER TABLE public.content_grids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access grids" ON public.content_grids FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_grids.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_grids.workspace_id AND wm.user_id = auth.uid()));
CREATE TRIGGER tg_content_grids_updated_at BEFORE UPDATE ON public.content_grids FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- content_pieces_v2
-- ============================================================
CREATE TABLE public.content_pieces_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  grid_id uuid REFERENCES public.content_grids(id) ON DELETE SET NULL,
  pillar_id uuid REFERENCES public.content_pillars(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  publish_at timestamptz,
  format public.piece_format NOT NULL DEFAULT 'post',
  channels public.piece_channel[] NOT NULL DEFAULT '{}',
  status public.piece_status_v2 NOT NULL DEFAULT 'idea',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  asset_url text,
  cta text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pieces_v2 TO authenticated;
GRANT ALL ON public.content_pieces_v2 TO service_role;
ALTER TABLE public.content_pieces_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access pieces v2" ON public.content_pieces_v2 FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_pieces_v2.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_pieces_v2.workspace_id AND wm.user_id = auth.uid()));
CREATE INDEX idx_pieces_v2_ws_pub ON public.content_pieces_v2(workspace_id, publish_at);
CREATE INDEX idx_pieces_v2_grid ON public.content_pieces_v2(grid_id);
CREATE INDEX idx_pieces_v2_status ON public.content_pieces_v2(status);
CREATE INDEX idx_pieces_v2_pillar ON public.content_pieces_v2(pillar_id);
CREATE TRIGGER tg_pieces_v2_updated_at BEFORE UPDATE ON public.content_pieces_v2 FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- piece_carousel_slides (6 fijas)
-- ============================================================
CREATE TABLE public.piece_carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.content_pieces_v2(id) ON DELETE CASCADE,
  slide_index smallint NOT NULL CHECK (slide_index BETWEEN 1 AND 6),
  role public.carousel_slide_role NOT NULL,
  text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (piece_id, slide_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_carousel_slides TO authenticated;
GRANT ALL ON public.piece_carousel_slides TO service_role;
ALTER TABLE public.piece_carousel_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access slides" ON public.piece_carousel_slides FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_carousel_slides.piece_id AND wm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_carousel_slides.piece_id AND wm.user_id = auth.uid()
  ));
CREATE TRIGGER tg_slides_updated_at BEFORE UPDATE ON public.piece_carousel_slides FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- piece_video_sections (3 fijas)
-- ============================================================
CREATE TABLE public.piece_video_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.content_pieces_v2(id) ON DELETE CASCADE,
  section public.video_section NOT NULL,
  start_ts text,
  end_ts text,
  script text NOT NULL DEFAULT '',
  recording_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (piece_id, section)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_video_sections TO authenticated;
GRANT ALL ON public.piece_video_sections TO service_role;
ALTER TABLE public.piece_video_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access video sections" ON public.piece_video_sections FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_video_sections.piece_id AND wm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_video_sections.piece_id AND wm.user_id = auth.uid()
  ));
CREATE TRIGGER tg_video_sections_updated_at BEFORE UPDATE ON public.piece_video_sections FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- piece_poll (0 or 1 per piece)
-- ============================================================
CREATE TABLE public.piece_poll (
  piece_id uuid PRIMARY KEY REFERENCES public.content_pieces_v2(id) ON DELETE CASCADE,
  question text NOT NULL DEFAULT '',
  options text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_poll TO authenticated;
GRANT ALL ON public.piece_poll TO service_role;
ALTER TABLE public.piece_poll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access poll" ON public.piece_poll FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_poll.piece_id AND wm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_poll.piece_id AND wm.user_id = auth.uid()
  ));
CREATE TRIGGER tg_poll_updated_at BEFORE UPDATE ON public.piece_poll FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- piece_channel_copies
-- ============================================================
CREATE TABLE public.piece_channel_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.content_pieces_v2(id) ON DELETE CASCADE,
  channel public.piece_channel NOT NULL,
  body text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (piece_id, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_channel_copies TO authenticated;
GRANT ALL ON public.piece_channel_copies TO service_role;
ALTER TABLE public.piece_channel_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access copies" ON public.piece_channel_copies FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_channel_copies.piece_id AND wm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_pieces_v2 p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = piece_channel_copies.piece_id AND wm.user_id = auth.uid()
  ));
CREATE TRIGGER tg_copies_updated_at BEFORE UPDATE ON public.piece_channel_copies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- Trigger: seed sub-estructura al crear pieza
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_seed_piece_substructure()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ch public.piece_channel;
BEGIN
  IF NEW.format = 'carrusel' THEN
    INSERT INTO public.piece_carousel_slides (piece_id, slide_index, role, text) VALUES
      (NEW.id, 1, 'portada', ''),
      (NEW.id, 2, 'contexto', ''),
      (NEW.id, 3, 'punto1', ''),
      (NEW.id, 4, 'punto2', ''),
      (NEW.id, 5, 'punto3', ''),
      (NEW.id, 6, 'cierre_cta', '')
    ON CONFLICT (piece_id, slide_index) DO NOTHING;
  ELSIF NEW.format IN ('reel','video') THEN
    INSERT INTO public.piece_video_sections (piece_id, section, start_ts, end_ts, script) VALUES
      (NEW.id, 'hook', '0:00', '0:04', ''),
      (NEW.id, 'desarrollo', '0:04', '', ''),
      (NEW.id, 'cierre', '', '', '')
    ON CONFLICT (piece_id, section) DO NOTHING;
  ELSIF NEW.format = 'encuesta' THEN
    INSERT INTO public.piece_poll (piece_id, question, options) VALUES (NEW.id, '', '{}')
    ON CONFLICT (piece_id) DO NOTHING;
  END IF;

  IF NEW.channels IS NOT NULL THEN
    FOREACH ch IN ARRAY NEW.channels LOOP
      INSERT INTO public.piece_channel_copies (piece_id, channel, body) VALUES (NEW.id, ch, '')
      ON CONFLICT (piece_id, channel) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER tg_seed_piece_sub AFTER INSERT ON public.content_pieces_v2
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_piece_substructure();

-- ============================================================
-- Trigger: al cambiar el formato, limpia sub-estructura y re-siembra
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_resync_piece_substructure()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.format <> OLD.format THEN
    DELETE FROM public.piece_carousel_slides WHERE piece_id = NEW.id;
    DELETE FROM public.piece_video_sections WHERE piece_id = NEW.id;
    DELETE FROM public.piece_poll WHERE piece_id = NEW.id;

    IF NEW.format = 'carrusel' THEN
      INSERT INTO public.piece_carousel_slides (piece_id, slide_index, role, text) VALUES
        (NEW.id, 1, 'portada', ''),
        (NEW.id, 2, 'contexto', ''),
        (NEW.id, 3, 'punto1', ''),
        (NEW.id, 4, 'punto2', ''),
        (NEW.id, 5, 'punto3', ''),
        (NEW.id, 6, 'cierre_cta', '');
    ELSIF NEW.format IN ('reel','video') THEN
      INSERT INTO public.piece_video_sections (piece_id, section, start_ts, end_ts, script) VALUES
        (NEW.id, 'hook', '0:00', '0:04', ''),
        (NEW.id, 'desarrollo', '0:04', '', ''),
        (NEW.id, 'cierre', '', '', '');
    ELSIF NEW.format = 'encuesta' THEN
      INSERT INTO public.piece_poll (piece_id, question, options) VALUES (NEW.id, '', '{}');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tg_resync_piece_sub AFTER UPDATE OF format ON public.content_pieces_v2
FOR EACH ROW EXECUTE FUNCTION public.tg_resync_piece_substructure();

-- ============================================================
-- Function: seed pilares base para un workspace
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_pillars(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.content_pillars (workspace_id, key, label, color, sort_order) VALUES
    (_workspace_id, 'ia_aplicada', 'IA aplicada', '#8b5cf6', 1),
    (_workspace_id, 'hubspot_crm', 'HubSpot / CRM', '#f97316', 2),
    (_workspace_id, 'la_pista', 'La pista (servicios)', '#ec4899', 3),
    (_workspace_id, 'antes_del_crm', 'Antes del CRM (podcast)', '#06b6d4', 4),
    (_workspace_id, 'pulso_comercial', 'Pulso Comercial', '#eab308', 5),
    (_workspace_id, 'autoridad', 'Autoridad / educación', '#22c55e', 6)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$$;

-- Sembrar en todos los workspaces existentes
DO $$
DECLARE ws record;
BEGIN
  FOR ws IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_default_pillars(ws.id);
  END LOOP;
END $$;
