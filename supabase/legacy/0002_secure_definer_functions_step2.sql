REVOKE EXECUTE ON FUNCTION
  public.add_business_days(uuid, date, integer),
  public.can_access_account(uuid, uuid),
  public.check_due_tasks(),
  public.email_queue_dispatch(),
  public.email_queue_wake(),
  public.enqueue_notification(uuid, uuid, uuid, text, text, text, text, uuid, text),
  public.ensure_client_ticket_form(uuid),
  public.generate_project_sprints(uuid, date),
  public.get_notification_channels(uuid, text),
  public.insert_sprints_bulk(uuid, date, integer, integer, integer, numeric),
  public.insert_task_assignees_bulk(jsonb),
  public.insert_task_recurrence_batch(jsonb),
  public.is_non_working_day(uuid, uuid, date),
  public.list_my_permissions(uuid),
  public.project_account_visible(uuid, uuid),
  public.purge_deleted_tasks(),
  public.recalc_phase_dates(uuid),
  public.recalc_task_dates(uuid),
  public.recompute_task_estimate_split(uuid),
  public.regenerate_sprint_dates(uuid, date, integer),
  public.restore_deleted_task(uuid),
  public.seed_workspace_internal_categories(uuid),
  public.seed_workspace_slas(uuid),
  public.seed_workspace_task_types(uuid),
  public.update_phase_raw(uuid, text, date, date, integer)
FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION
  public.add_business_days(uuid, date, integer),
  public.check_due_tasks(),
  public.email_queue_dispatch(),
  public.email_queue_wake(),
  public.enqueue_notification(uuid, uuid, uuid, text, text, text, text, uuid, text),
  public.get_notification_channels(uuid, text),
  public.purge_deleted_tasks(),
  public.recalc_phase_dates(uuid),
  public.recalc_task_dates(uuid),
  public.seed_workspace_internal_categories(uuid),
  public.seed_workspace_slas(uuid),
  public.seed_workspace_task_types(uuid)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.can_access_account(uuid, uuid),
  public.ensure_client_ticket_form(uuid),
  public.generate_project_sprints(uuid, date),
  public.insert_sprints_bulk(uuid, date, integer, integer, integer, numeric),
  public.insert_task_assignees_bulk(jsonb),
  public.insert_task_recurrence_batch(jsonb),
  public.is_non_working_day(uuid, uuid, date),
  public.list_my_permissions(uuid),
  public.project_account_visible(uuid, uuid),
  public.recompute_task_estimate_split(uuid),
  public.regenerate_sprint_dates(uuid, date, integer),
  public.restore_deleted_task(uuid),
  public.update_phase_raw(uuid, text, date, date, integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.add_business_days(uuid, date, integer),
  public.can_access_account(uuid, uuid),
  public.check_due_tasks(),
  public.email_queue_dispatch(),
  public.email_queue_wake(),
  public.enqueue_notification(uuid, uuid, uuid, text, text, text, text, uuid, text),
  public.ensure_client_ticket_form(uuid),
  public.generate_project_sprints(uuid, date),
  public.get_notification_channels(uuid, text),
  public.insert_sprints_bulk(uuid, date, integer, integer, integer, numeric),
  public.insert_task_assignees_bulk(jsonb),
  public.insert_task_recurrence_batch(jsonb),
  public.is_non_working_day(uuid, uuid, date),
  public.list_my_permissions(uuid),
  public.project_account_visible(uuid, uuid),
  public.purge_deleted_tasks(),
  public.recalc_phase_dates(uuid),
  public.recalc_task_dates(uuid),
  public.recompute_task_estimate_split(uuid),
  public.regenerate_sprint_dates(uuid, date, integer),
  public.restore_deleted_task(uuid),
  public.seed_workspace_internal_categories(uuid),
  public.seed_workspace_slas(uuid),
  public.seed_workspace_task_types(uuid),
  public.update_phase_raw(uuid, text, date, date, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_client_ticket_form(_project_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_form_id uuid; v_workspace uuid; v_phase_id uuid; v_slug text; v_max_pos int; v_default_schema jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app_private.can_edit_project(_project_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_form_id FROM public.client_ticket_forms WHERE project_id = _project_id;
  IF v_form_id IS NOT NULL THEN RETURN v_form_id; END IF;
  SELECT workspace_id INTO v_workspace FROM public.projects WHERE id = _project_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  SELECT id INTO v_phase_id FROM public.phases WHERE project_id = _project_id AND is_ticket_inbox = true LIMIT 1;
  IF v_phase_id IS NULL THEN
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_max_pos FROM public.phases WHERE project_id = _project_id;
    INSERT INTO public.phases (project_id, name, order_index, is_ticket_inbox)
    VALUES (_project_id, 'Tickets', v_max_pos, true) RETURNING id INTO v_phase_id;
  END IF;
  LOOP
    v_slug := lower(substring(md5(random()::text || clock_timestamp()::text || _project_id::text), 1, 16));
    IF NOT EXISTS (SELECT 1 FROM public.client_ticket_forms WHERE slug = v_slug) THEN EXIT; END IF;
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
  VALUES (v_workspace, _project_id, v_slug, v_phase_id, v_default_schema, true) RETURNING id INTO v_form_id;
  RETURN v_form_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_project_sprints(_project_id uuid, _first_start date DEFAULT NULL::date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c public.contracts%ROWTYPE; v_contract uuid; v_hours numeric; cur_start date; cur_end date;
  end_d date; next_n int; created_count int := 0; step_interval interval;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app_private.can_edit_project(_project_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  SELECT p.contract_id, COALESCE(p.hours_per_sprint, 0) INTO v_contract, v_hours
    FROM public.projects p WHERE p.id = _project_id;
  IF v_contract IS NULL THEN RETURN 0; END IF;
  SELECT * INTO c FROM public.contracts WHERE id = v_contract;
  IF NOT FOUND OR c.sprint_cadence IS NULL THEN RETURN 0; END IF;
  IF v_hours = 0 THEN v_hours := COALESCE(c.hours_per_sprint, 0); END IF;
  step_interval := CASE c.sprint_cadence
    WHEN 'monthly'  THEN INTERVAL '1 month'
    WHEN 'biweekly' THEN INTERVAL '15 days'
    WHEN 'weekly'   THEN INTERVAL '7 days'
  END;
  IF step_interval IS NULL THEN RETURN 0; END IF;
  cur_start := COALESCE(_first_start, c.start_date);
  end_d := COALESCE(c.end_date, (cur_start + interval '12 months')::date);
  DELETE FROM public.sprints WHERE project_id = _project_id AND status = 'por_planificar';
  SELECT COALESCE(MAX(sprint_number), 0) INTO next_n FROM public.sprints WHERE project_id = _project_id;
  WHILE cur_start <= end_d LOOP
    cur_end := LEAST(((cur_start + step_interval)::date - 1), end_d);
    next_n := next_n + 1;
    INSERT INTO public.sprints(contract_id, project_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (v_contract, _project_id, next_n, cur_start, cur_end, v_hours, 'por_planificar');
    created_count := created_count + 1;
    cur_start := (cur_end + INTERVAL '1 day')::date;
  END LOOP;
  RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_sprints_bulk(_contract_id uuid, _first_start date, _sprint_days integer, _from_number integer, _to_number integer, _hours numeric)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i int; sd date; ed date; cnt int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = _contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
          ARRAY['owner','admin','member']::public.workspace_role[])
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  FOR i IN _from_number.._to_number LOOP
    sd := _first_start + ((i - 1) * _sprint_days);
    ed := _first_start + (i * _sprint_days - 1);
    INSERT INTO public.sprints(contract_id, sprint_number, start_date, end_date, contracted_hours, status)
    VALUES (_contract_id, i, sd, ed, COALESCE(_hours, 0), 'por_planificar');
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_sprint_dates(_contract_id uuid, _first_start date, _sprint_days integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; sd date; ed date; n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = _contract_id
      AND app_private.has_workspace_role(c.workspace_id, auth.uid(),
          ARRAY['owner','admin','member']::public.workspace_role[])
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  FOR r IN SELECT id, sprint_number FROM public.sprints WHERE contract_id = _contract_id ORDER BY sprint_number LOOP
    sd := _first_start + ((r.sprint_number - 1) * _sprint_days);
    ed := _first_start + (r.sprint_number * _sprint_days - 1);
    UPDATE public.sprints SET start_date = sd, end_date = ed WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_phase_raw(_id uuid, _name text, _start_date date, _end_date date, _order_index integer)
 RETURNS phases LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.phases;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.phases ph WHERE ph.id = _id
      AND app_private.can_edit_project(ph.project_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.skip_working_day_check', 'on', true);
  UPDATE public.phases
  SET name = COALESCE(_name, name), start_date = _start_date, end_date = _end_date,
      order_index = COALESCE(_order_index, order_index)
  WHERE id = _id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_phase_dates(_root uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cur uuid; queue uuid[] := ARRAY[_root]; visited uuid[] := ARRAY[]::uuid[];
  dep record; new_start date; shift_days int; ws_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.phases WHERE id = _root)
     AND NOT EXISTS (
    SELECT 1 FROM public.phases ph WHERE ph.id = _root
      AND app_private.can_edit_project(ph.project_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WHILE array_length(queue, 1) > 0 LOOP
    cur := queue[1];
    queue := queue[2:array_length(queue,1)];
    IF cur = ANY(visited) THEN CONTINUE; END IF;
    visited := visited || cur;
    SELECT p.workspace_id INTO ws_id
    FROM public.phases ph JOIN public.projects p ON p.id = ph.project_id WHERE ph.id = cur;
    FOR dep IN
      SELECT d.successor_phase_id, d.lag_days, pp.end_date AS pred_end,
             sp.start_date AS succ_start, sp.end_date AS succ_end
      FROM public.phase_dependencies d
      JOIN public.phases pp ON pp.id = d.predecessor_phase_id
      JOIN public.phases sp ON sp.id = d.successor_phase_id
      WHERE d.predecessor_phase_id = cur
    LOOP
      IF dep.pred_end IS NULL THEN queue := queue || dep.successor_phase_id; CONTINUE; END IF;
      new_start := public.add_business_days(ws_id, dep.pred_end, GREATEST(dep.lag_days, 0) + 1);
      IF dep.succ_start IS NULL OR new_start > dep.succ_start THEN
        IF dep.succ_start IS NOT NULL THEN shift_days := (new_start - dep.succ_start); ELSE shift_days := 0; END IF;
        UPDATE public.phases
          SET start_date = new_start,
              end_date = CASE WHEN dep.succ_end IS NOT NULL THEN dep.succ_end + shift_days ELSE NULL END,
              updated_at = now()
          WHERE id = dep.successor_phase_id;
        IF shift_days <> 0 THEN
          UPDATE public.tasks
            SET start_date = start_date + shift_days, due_date = due_date + shift_days, updated_at = now()
            WHERE phase_id = dep.successor_phase_id AND (start_date IS NOT NULL OR due_date IS NOT NULL);
        END IF;
      END IF;
      queue := queue || dep.successor_phase_id;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_task_dates(_root uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cur uuid; queue uuid[] := ARRAY[_root]; visited uuid[] := ARRAY[]::uuid[];
  dep record; pred_due date; succ_start date; succ_due date; new_start date; new_due date;
  duration int; ws_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.tasks WHERE id = _root)
     AND NOT app_private.can_access_task(_root, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WHILE array_length(queue, 1) > 0 LOOP
    cur := queue[1];
    queue := queue[2:array_length(queue,1)];
    IF cur = ANY(visited) THEN CONTINUE; END IF;
    visited := visited || cur;
    SELECT p.workspace_id INTO ws_id
    FROM public.tasks t JOIN public.projects p ON p.id = t.project_id WHERE t.id = cur;
    FOR dep IN
      SELECT d.successor_task_id, d.lag_days, pt.due_date AS pred_due,
             st.start_date AS succ_start, st.due_date AS succ_due
      FROM public.task_dependencies d
      JOIN public.tasks pt ON pt.id = d.predecessor_task_id
      JOIN public.tasks st ON st.id = d.successor_task_id
      WHERE d.predecessor_task_id = cur
    LOOP
      pred_due := dep.pred_due; succ_start := dep.succ_start; succ_due := dep.succ_due;
      IF pred_due IS NULL THEN queue := queue || dep.successor_task_id; CONTINUE; END IF;
      new_start := public.add_business_days(ws_id, pred_due, GREATEST(dep.lag_days, 0) + 1);
      IF succ_start IS NULL OR new_start > succ_start THEN
        IF succ_start IS NOT NULL AND succ_due IS NOT NULL THEN duration := (succ_due - succ_start); ELSE duration := 0; END IF;
        new_due := new_start + duration;
        UPDATE public.tasks SET start_date = new_start, due_date = new_due, updated_at = now()
          WHERE id = dep.successor_task_id;
      END IF;
      queue := queue || dep.successor_task_id;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_task_estimate_split(_task_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric(10,2); v_manual_sum numeric(10,2) := 0;
  v_manual_users uuid[] := ARRAY[]::uuid[]; v_all_users uuid[] := ARRAY[]::uuid[];
  v_auto_users uuid[] := ARRAY[]::uuid[]; v_auto_hours numeric(10,2) := 0;
  v_share numeric(10,2) := 0; v_new_total numeric(10,2);
BEGIN
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id)
     AND NOT app_private.can_access_task(_task_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(total_effort_hours, 0) INTO v_total FROM public.tasks WHERE id = _task_id;
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[]) INTO v_all_users
    FROM public.task_assignees WHERE task_id = _task_id;
  SELECT COALESCE(array_agg(te.user_id), ARRAY[]::uuid[]), COALESCE(SUM(te.hours), 0)
    INTO v_manual_users, v_manual_sum
    FROM public.task_estimates te
    WHERE te.task_id = _task_id AND te.manual = true AND te.user_id = ANY(v_all_users);
  DELETE FROM public.task_estimates
   WHERE task_id = _task_id
     AND (v_all_users = ARRAY[]::uuid[] OR NOT (user_id = ANY(v_all_users)));
  IF array_length(v_all_users, 1) IS NULL THEN RETURN; END IF;
  SELECT COALESCE(array_agg(u), ARRAY[]::uuid[]) INTO v_auto_users
    FROM unnest(v_all_users) u WHERE NOT (u = ANY(v_manual_users));
  IF array_length(v_auto_users, 1) IS NOT NULL AND array_length(v_auto_users, 1) > 0 THEN
    v_auto_hours := GREATEST(0, v_total - v_manual_sum);
    v_share := ROUND(v_auto_hours / array_length(v_auto_users, 1)::numeric, 2);
  END IF;
  INSERT INTO public.task_estimates (task_id, user_id, hours, manual)
  SELECT _task_id, u,
         CASE WHEN u = ANY(v_manual_users) THEN
           (SELECT hours FROM public.task_estimates WHERE task_id = _task_id AND user_id = u)
         ELSE v_share END,
         u = ANY(v_manual_users)
  FROM unnest(v_all_users) u
  ON CONFLICT (task_id, user_id) DO UPDATE
     SET hours = EXCLUDED.hours, manual = EXCLUDED.manual, updated_at = now();
  SELECT COALESCE(SUM(hours), 0) INTO v_new_total FROM public.task_estimates WHERE task_id = _task_id;
  IF v_new_total IS DISTINCT FROM v_total THEN
    UPDATE public.tasks SET total_effort_hours = v_new_total WHERE id = _task_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_non_working_day(_workspace_id uuid, _user_id uuid, _date date)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE dow int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app_private.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _date IS NULL THEN RETURN false; END IF;
  dow := EXTRACT(ISODOW FROM _date);
  IF dow IN (6,7) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_holidays h
     WHERE h.workspace_id = _workspace_id AND h.date = _date
       AND COALESCE(h.portion,'full') = 'full'
       AND (h.affects = 'all' OR (h.affects = 'user' AND _user_id IS NOT NULL AND h.user_id = _user_id))
  ) THEN RETURN true; END IF;
  RETURN false;
END $function$;