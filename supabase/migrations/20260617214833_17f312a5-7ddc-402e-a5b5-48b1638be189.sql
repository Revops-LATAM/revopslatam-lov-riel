
-- Enum para estado de inbox
CREATE TYPE public.calendar_event_inbox_status AS ENUM ('pending', 'classified', 'ignored', 'private');

-- Enum para estado de conexión
CREATE TYPE public.calendar_connection_status AS ENUM ('active', 'needs_reauth', 'revoked');

-- ============================================
-- TABLE: user_calendar_connections
-- ============================================
CREATE TABLE public.user_calendar_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  google_account_email TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  status public.calendar_connection_status NOT NULL DEFAULT 'active',
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendar_connections TO authenticated;
GRANT ALL ON public.user_calendar_connections TO service_role;

ALTER TABLE public.user_calendar_connections ENABLE ROW LEVEL SECURITY;

-- Users see their own connection; workspace members can see existence (email + status) of others — handled in app layer by selecting safe columns
CREATE POLICY "Users see their own calendar connection"
  ON public.user_calendar_connections FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert their own calendar connection"
  ON public.user_calendar_connections FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Users update their own calendar connection"
  ON public.user_calendar_connections FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete their own calendar connection"
  ON public.user_calendar_connections FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_user_calendar_connections_updated_at
  BEFORE UPDATE ON public.user_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_user_calendar_connections_user ON public.user_calendar_connections(user_id);
CREATE INDEX idx_user_calendar_connections_workspace ON public.user_calendar_connections(workspace_id);
CREATE INDEX idx_user_calendar_connections_active ON public.user_calendar_connections(status) WHERE status = 'active';

-- ============================================
-- TABLE: calendar_events
-- ============================================
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.user_calendar_connections(id) ON DELETE CASCADE,

  -- Google identifiers
  google_event_id TEXT NOT NULL,
  google_recurring_event_id TEXT,           -- master id for recurring events
  google_ical_uid TEXT,

  -- Times & basics
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  title TEXT,                                -- null when is_private = true
  attendees_count INTEGER NOT NULL DEFAULT 0,
  organizer_email TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false, -- mirrors Google "private" visibility
  is_ooo BOOLEAN NOT NULL DEFAULT false,
  google_status TEXT,                        -- confirmed / tentative / cancelled
  html_link TEXT,

  -- Classification
  inbox_status public.calendar_event_inbox_status NOT NULL DEFAULT 'pending',
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES public.phases(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  classified_at TIMESTAMPTZ,
  classified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (connection_id, google_event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Any workspace member can SEE non-private events for capacity views
CREATE POLICY "Workspace members can view non-private calendar events"
  ON public.calendar_events FOR SELECT
  TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (is_private = false OR user_id = auth.uid())
  );

-- Only the owner can insert/update/delete their events (or service_role via admin sync)
CREATE POLICY "Owner inserts their own calendar events"
  ON public.calendar_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner updates their own calendar events"
  ON public.calendar_events FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner deletes their own calendar events"
  ON public.calendar_events FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_calendar_events_user_time ON public.calendar_events(user_id, start_at);
CREATE INDEX idx_calendar_events_workspace_time ON public.calendar_events(workspace_id, start_at);
CREATE INDEX idx_calendar_events_inbox ON public.calendar_events(user_id, inbox_status) WHERE inbox_status = 'pending';
CREATE INDEX idx_calendar_events_project ON public.calendar_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_calendar_events_recurring ON public.calendar_events(connection_id, google_recurring_event_id) WHERE google_recurring_event_id IS NOT NULL;

-- ============================================
-- TABLE: calendar_recurring_classifications
-- ============================================
CREATE TABLE public.calendar_recurring_classifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.user_calendar_connections(id) ON DELETE CASCADE,
  google_recurring_event_id TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  sprint_id UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES public.phases(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  inbox_status public.calendar_event_inbox_status NOT NULL DEFAULT 'classified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, google_recurring_event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_recurring_classifications TO authenticated;
GRANT ALL ON public.calendar_recurring_classifications TO service_role;

ALTER TABLE public.calendar_recurring_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages their recurring classifications"
  ON public.calendar_recurring_classifications FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_calendar_recurring_classifications_updated_at
  BEFORE UPDATE ON public.calendar_recurring_classifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_calendar_recurring_user ON public.calendar_recurring_classifications(user_id);
