
-- 1. asana_project_sync_config
CREATE TABLE public.asana_project_sync_config (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status_mode text NOT NULL DEFAULT 'completed_only' CHECK (status_mode IN ('completed_only','sections','custom_field')),
  asana_status_field_gid text,
  push_enabled boolean NOT NULL DEFAULT true,
  pull_enabled boolean NOT NULL DEFAULT true,
  comments_enabled boolean NOT NULL DEFAULT true,
  last_webhook_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_project_sync_config TO authenticated;
GRANT ALL ON public.asana_project_sync_config TO service_role;

ALTER TABLE public.asana_project_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana sync config" ON public.asana_project_sync_config
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana sync config" ON public.asana_project_sync_config
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_project_sync_config_set_updated_at
  BEFORE UPDATE ON public.asana_project_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. asana_webhook_subscriptions
CREATE TABLE public.asana_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asana_webhook_gid text,
  asana_resource_gid text NOT NULL,
  secret text,
  active boolean NOT NULL DEFAULT true,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_webhook_subscriptions TO authenticated;
GRANT ALL ON public.asana_webhook_subscriptions TO service_role;

ALTER TABLE public.asana_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage asana webhooks" ON public.asana_webhook_subscriptions
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER asana_webhook_subscriptions_set_updated_at
  BEFORE UPDATE ON public.asana_webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. asana_comment_map
CREATE TABLE public.asana_comment_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  asana_story_gid text NOT NULL,
  asana_task_gid text NOT NULL,
  source text NOT NULL CHECK (source IN ('riel','asana')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id),
  UNIQUE(workspace_id, asana_story_gid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_comment_map TO authenticated;
GRANT ALL ON public.asana_comment_map TO service_role;

ALTER TABLE public.asana_comment_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view asana comment map" ON public.asana_comment_map
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage asana comment map" ON public.asana_comment_map
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

-- 4. Extender asana_status_map
ALTER TABLE public.asana_status_map
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'completed_only' CHECK (kind IN ('completed_only','section','custom_field_enum'));

-- 5. Extender asana_task_map
ALTER TABLE public.asana_task_map
  ADD COLUMN IF NOT EXISTS asana_modified_at timestamptz;

-- 6. Triggers de encolado
CREATE OR REPLACE FUNCTION public.enqueue_asana_push_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid;
  v_has_map boolean;
  v_cfg boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
       AND NEW.status_id IS NOT DISTINCT FROM OLD.status_id
       AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.asana_task_map WHERE task_id = NEW.id) INTO v_has_map;
  IF NOT v_has_map THEN RETURN NEW; END IF;

  SELECT p.workspace_id, COALESCE(c.push_enabled, true)
    INTO v_workspace, v_cfg
    FROM public.projects p
    LEFT JOIN public.asana_project_sync_config c ON c.project_id = p.id
   WHERE p.id = NEW.project_id;

  IF v_workspace IS NULL OR NOT v_cfg THEN RETURN NEW; END IF;

  INSERT INTO public.asana_sync_queue (workspace_id, direction, resource_kind, riel_id, payload)
  VALUES (v_workspace, 'push', 'task', NEW.id, jsonb_build_object('task_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_enqueue_asana_push
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_asana_push_task();

CREATE OR REPLACE FUNCTION public.enqueue_asana_push_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid;
  v_has_map boolean;
  v_cfg boolean;
  v_project uuid;
BEGIN
  -- Skip if this comment was just inserted from Asana pull
  IF EXISTS(SELECT 1 FROM public.asana_comment_map WHERE comment_id = NEW.id AND source = 'asana') THEN
    RETURN NEW;
  END IF;

  SELECT t.project_id INTO v_project FROM public.tasks t WHERE t.id = NEW.task_id;
  IF v_project IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS(SELECT 1 FROM public.asana_task_map WHERE task_id = NEW.task_id) INTO v_has_map;
  IF NOT v_has_map THEN RETURN NEW; END IF;

  SELECT p.workspace_id, COALESCE(c.comments_enabled, true)
    INTO v_workspace, v_cfg
    FROM public.projects p
    LEFT JOIN public.asana_project_sync_config c ON c.project_id = p.id
   WHERE p.id = v_project;

  IF v_workspace IS NULL OR NOT v_cfg THEN RETURN NEW; END IF;

  INSERT INTO public.asana_sync_queue (workspace_id, direction, resource_kind, riel_id, payload)
  VALUES (v_workspace, 'push', 'comment', NEW.id, jsonb_build_object('comment_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER comments_enqueue_asana_push
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_asana_push_comment();
