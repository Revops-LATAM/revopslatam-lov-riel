
-- ============================================================
-- 1. Extend profiles with handle + slack_user_id
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS slack_user_id text;

-- Backfill handle from email prefix (lowercase, alphanumeric)
UPDATE public.profiles
SET handle = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9]', '', 'g'))
WHERE handle IS NULL;

-- Ensure uniqueness (append random suffix on collision)
DO $$
DECLARE r record; suffix int := 2;
BEGIN
  FOR r IN
    SELECT handle FROM public.profiles
    WHERE handle IS NOT NULL
    GROUP BY handle HAVING COUNT(*) > 1
  LOOP
    UPDATE public.profiles p
    SET handle = p.handle || suffix::text
    WHERE p.handle = r.handle
      AND p.id <> (SELECT id FROM public.profiles WHERE handle = r.handle ORDER BY created_at LIMIT 1);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique ON public.profiles (lower(handle)) WHERE handle IS NOT NULL;

-- Auto-derive handle on new profile if not set
CREATE OR REPLACE FUNCTION public.profiles_derive_handle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; n int := 1;
BEGIN
  IF NEW.handle IS NOT NULL AND NEW.handle <> '' THEN RETURN NEW; END IF;
  base := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9]', '', 'g'));
  IF base = '' THEN base := 'user'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(handle) = candidate AND id <> NEW.id) LOOP
    n := n + 1;
    candidate := base || n::text;
  END LOOP;
  NEW.handle := candidate;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_profiles_derive_handle ON public.profiles;
CREATE TRIGGER tg_profiles_derive_handle
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_derive_handle();

-- ============================================================
-- 2. notifications table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,           -- recipient
  actor_id uuid,                    -- who caused it (may be null for system)
  kind text NOT NULL,               -- mention | assignment_added | assignment_removed | status_change | due_soon | overdue | ticket_new | ticket_client_reply
  title text NOT NULL,
  body text,
  entity_type text,                 -- task | ticket | comment
  entity_id uuid,
  url text,
  read_at timestamptz,
  channels_sent jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {desktop:true,email:true,slack:true}
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_pending_dispatch_idx
  ON public.notifications (created_at) WHERE channels_sent = '{}'::jsonb;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users mark own read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ============================================================
-- 3. notification_preferences (per user × kind)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  desktop boolean NOT NULL DEFAULT true,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  slack boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own prefs"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Sensible defaults resolver
CREATE OR REPLACE FUNCTION public.get_notification_channels(_user_id uuid, _kind text)
RETURNS TABLE (desktop bool, in_app bool, email bool, slack bool)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(p.desktop,
      CASE WHEN _kind IN ('mention','assignment_added','ticket_new','ticket_client_reply') THEN true ELSE false END),
    COALESCE(p.in_app, true),
    COALESCE(p.email,
      CASE WHEN _kind IN ('mention','assignment_added','ticket_client_reply') THEN false ELSE false END),
    COALESCE(p.slack,
      CASE WHEN _kind IN ('mention','ticket_new','ticket_client_reply') THEN false ELSE false END)
  FROM (SELECT 1) x
  LEFT JOIN public.notification_preferences p
    ON p.user_id = _user_id AND p.kind = _kind;
END $$;

-- ============================================================
-- 4. push_subscriptions (Web Push endpoints)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 5. Helper: enqueue notification (skip if user = actor)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _workspace_id uuid,
  _user_id uuid,
  _actor_id uuid,
  _kind text,
  _title text,
  _body text,
  _entity_type text,
  _entity_id uuid,
  _url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL OR _user_id = _actor_id THEN RETURN; END IF;
  INSERT INTO public.notifications (
    workspace_id, user_id, actor_id, kind, title, body, entity_type, entity_id, url
  ) VALUES (
    _workspace_id, _user_id, _actor_id, _kind, _title, _body, _entity_type, _entity_id, _url
  );
END $$;

-- ============================================================
-- 6. Trigger: task_comments — @mentions + ticket client reply
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_task_comments_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task record;
  v_actor_name text;
  v_handle text;
  v_recipient uuid;
  v_url text;
  v_assignee record;
BEGIN
  SELECT t.id, t.workspace_id, t.title, t.created_by, tt.slug AS type_slug
  INTO v_task
  FROM public.tasks t
  LEFT JOIN public.task_types tt ON tt.id = t.type_id
  WHERE t.id = NEW.task_id;
  IF v_task.id IS NULL THEN RETURN NEW; END IF;

  v_url := '/tasks/' || v_task.id::text;

  -- Actor display name
  IF NEW.author_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;
  ELSE
    v_actor_name := COALESCE(NEW.client_author_email, 'Cliente');
  END IF;

  -- 1) @mentions -> notify each handle
  FOR v_handle IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(COALESCE(NEW.body,''), '@([a-zA-Z0-9_]+)', 'g') AS m
  LOOP
    SELECT id INTO v_recipient FROM public.profiles WHERE lower(handle) = v_handle LIMIT 1;
    IF v_recipient IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_task.workspace_id, v_recipient, NEW.author_id,
        'mention',
        v_actor_name || ' te mencionó',
        left(COALESCE(NEW.body,''), 240),
        'task', v_task.id, v_url
      );
    END IF;
  END LOOP;

  -- 2) Client reply on a ticket -> notify assignees + creator
  IF NEW.client_author_email IS NOT NULL AND v_task.type_slug = 'ticket' THEN
    FOR v_assignee IN
      SELECT DISTINCT user_id FROM public.task_assignees WHERE task_id = v_task.id
      UNION SELECT v_task.created_by
    LOOP
      PERFORM public.enqueue_notification(
        v_task.workspace_id, v_assignee.user_id, NULL,
        'ticket_client_reply',
        'Cliente respondió: ' || COALESCE(v_task.title,'ticket'),
        left(COALESCE(NEW.body,''), 240),
        'ticket', v_task.id, v_url
      );
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_task_comments_notify ON public.task_comments;
CREATE TRIGGER tg_task_comments_notify
AFTER INSERT ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.tg_task_comments_notify();

-- ============================================================
-- 7. Trigger: task_assignees — added / removed
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_task_assignees_notify_ins()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_task record; v_actor uuid;
BEGIN
  SELECT t.id, t.workspace_id, t.title, tt.slug AS type_slug
  INTO v_task
  FROM public.tasks t
  LEFT JOIN public.task_types tt ON tt.id = t.type_id
  WHERE t.id = NEW.task_id;
  IF v_task.id IS NULL THEN RETURN NEW; END IF;
  v_actor := auth.uid();

  PERFORM public.enqueue_notification(
    v_task.workspace_id, NEW.user_id, v_actor,
    CASE WHEN v_task.type_slug = 'ticket' THEN 'ticket_new' ELSE 'assignment_added' END,
    CASE WHEN v_task.type_slug = 'ticket'
         THEN 'Nuevo ticket asignado: ' || COALESCE(v_task.title,'')
         ELSE 'Te asignaron: ' || COALESCE(v_task.title,'') END,
    NULL, 'task', v_task.id, '/tasks/' || v_task.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_task_assignees_notify_ins ON public.task_assignees;
CREATE TRIGGER tg_task_assignees_notify_ins
AFTER INSERT ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.tg_task_assignees_notify_ins();

CREATE OR REPLACE FUNCTION public.tg_task_assignees_notify_del()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_task record; v_actor uuid;
BEGIN
  SELECT id, workspace_id, title INTO v_task FROM public.tasks WHERE id = OLD.task_id;
  IF v_task.id IS NULL THEN RETURN OLD; END IF;
  v_actor := auth.uid();
  PERFORM public.enqueue_notification(
    v_task.workspace_id, OLD.user_id, v_actor,
    'assignment_removed',
    'Te removieron de: ' || COALESCE(v_task.title,''),
    NULL, 'task', v_task.id, '/tasks/' || v_task.id::text
  );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS tg_task_assignees_notify_del ON public.task_assignees;
CREATE TRIGGER tg_task_assignees_notify_del
AFTER DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.tg_task_assignees_notify_del();

-- ============================================================
-- 8. Trigger: tasks status change
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_tasks_notify_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid; v_status_name text; v_assignee record;
BEGIN
  IF NEW.status_id IS NULL OR NEW.status_id = OLD.status_id THEN RETURN NEW; END IF;
  v_actor := auth.uid();
  SELECT name INTO v_status_name FROM public.task_statuses WHERE id = NEW.status_id;

  FOR v_assignee IN
    SELECT DISTINCT user_id FROM public.task_assignees WHERE task_id = NEW.id
    UNION SELECT NEW.created_by
  LOOP
    PERFORM public.enqueue_notification(
      NEW.workspace_id, v_assignee.user_id, v_actor,
      'status_change',
      COALESCE(NEW.title,'Tarea') || ' → ' || COALESCE(v_status_name,'nuevo estado'),
      NULL, 'task', NEW.id, '/tasks/' || NEW.id::text
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_tasks_notify_status ON public.tasks;
CREATE TRIGGER tg_tasks_notify_status
AFTER UPDATE OF status_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_notify_status();

-- ============================================================
-- 9. Due-soon / overdue detector (called by cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_due_tasks()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; created_count int := 0;
BEGIN
  -- Due within 24h (not already notified as due_soon)
  FOR r IN
    SELECT t.id, t.workspace_id, t.title, t.end_date, ta.user_id
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    LEFT JOIN public.task_statuses ts ON ts.id = t.status_id
    WHERE t.end_date IS NOT NULL
      AND t.end_date >= now()
      AND t.end_date <= now() + interval '24 hours'
      AND COALESCE(ts.slug,'') NOT IN ('completada','cancelada','done','completed','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.entity_id = t.id AND n.user_id = ta.user_id
          AND n.kind = 'due_soon'
          AND n.created_at > now() - interval '48 hours'
      )
  LOOP
    PERFORM public.enqueue_notification(
      r.workspace_id, r.user_id, NULL, 'due_soon',
      'Vence pronto: ' || COALESCE(r.title,''),
      'Vence ' || to_char(r.end_date, 'DD-MM-YYYY HH24:MI'),
      'task', r.id, '/tasks/' || r.id::text
    );
    created_count := created_count + 1;
  END LOOP;

  -- Overdue (past due, not notified in last 24h)
  FOR r IN
    SELECT t.id, t.workspace_id, t.title, t.end_date, ta.user_id
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    LEFT JOIN public.task_statuses ts ON ts.id = t.status_id
    WHERE t.end_date IS NOT NULL
      AND t.end_date < now()
      AND t.end_date > now() - interval '7 days'
      AND COALESCE(ts.slug,'') NOT IN ('completada','cancelada','done','completed','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.entity_id = t.id AND n.user_id = ta.user_id
          AND n.kind = 'overdue'
          AND n.created_at > now() - interval '24 hours'
      )
  LOOP
    PERFORM public.enqueue_notification(
      r.workspace_id, r.user_id, NULL, 'overdue',
      'Vencida: ' || COALESCE(r.title,''),
      'Venció el ' || to_char(r.end_date, 'DD-MM-YYYY'),
      'task', r.id, '/tasks/' || r.id::text
    );
    created_count := created_count + 1;
  END LOOP;

  RETURN created_count;
END $$;
