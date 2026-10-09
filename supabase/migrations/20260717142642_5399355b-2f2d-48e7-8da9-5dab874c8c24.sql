
CREATE OR REPLACE FUNCTION public.tg_task_assignees_notify_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_task record; v_actor uuid;
BEGIN
  SELECT t.id, p.workspace_id, t.title, tt.key AS type_key
    INTO v_task
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  LEFT JOIN public.task_types tt ON tt.id = t.task_type_id
  WHERE t.id = NEW.task_id;
  IF v_task.id IS NULL THEN RETURN NEW; END IF;
  v_actor := auth.uid();
  PERFORM public.enqueue_notification(
    v_task.workspace_id, NEW.user_id, v_actor,
    CASE WHEN v_task.type_key = 'ticket' THEN 'ticket_new' ELSE 'assignment_added' END,
    CASE WHEN v_task.type_key = 'ticket'
         THEN 'Nuevo ticket asignado: ' || COALESCE(v_task.title,'')
         ELSE 'Te asignaron: ' || COALESCE(v_task.title,'') END,
    NULL, 'task', v_task.id, '/tasks/' || v_task.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_task_assignees_notify_ins failed: %', SQLERRM;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.tg_task_comments_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_task record; v_actor_name text; v_handle text; v_recipient uuid; v_url text; v_assignee record;
BEGIN
  SELECT t.id, p.workspace_id, t.title, t.created_by, tt.key AS type_key
    INTO v_task
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  LEFT JOIN public.task_types tt ON tt.id = t.task_type_id
  WHERE t.id = NEW.task_id;
  IF v_task.id IS NULL THEN RETURN NEW; END IF;
  v_url := '/tasks/' || v_task.id::text;
  IF NEW.author_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;
  ELSE
    v_actor_name := COALESCE(NEW.client_author_email, 'Cliente');
  END IF;
  FOR v_handle IN
    SELECT DISTINCT lower(m[1]) FROM regexp_matches(COALESCE(NEW.body,''), '@([a-zA-Z0-9_]+)', 'g') AS m
  LOOP
    SELECT id INTO v_recipient FROM public.profiles WHERE lower(handle) = v_handle LIMIT 1;
    IF v_recipient IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_task.workspace_id, v_recipient, NEW.author_id,
        'mention', v_actor_name || ' te mencionó',
        left(COALESCE(NEW.body,''), 240), 'task', v_task.id, v_url
      );
    END IF;
  END LOOP;
  IF NEW.client_author_email IS NOT NULL AND v_task.type_key = 'ticket' THEN
    FOR v_assignee IN
      SELECT user_id FROM public.task_assignees WHERE task_id = v_task.id
      UNION SELECT v_task.created_by
    LOOP
      PERFORM public.enqueue_notification(
        v_task.workspace_id, v_assignee.user_id, NULL,
        'ticket_client_reply',
        'Cliente respondió: ' || COALESCE(v_task.title,'ticket'),
        left(COALESCE(NEW.body,''), 240), 'ticket', v_task.id, v_url
      );
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_task_comments_notify failed: %', SQLERRM;
  RETURN NEW;
END $fn$;
