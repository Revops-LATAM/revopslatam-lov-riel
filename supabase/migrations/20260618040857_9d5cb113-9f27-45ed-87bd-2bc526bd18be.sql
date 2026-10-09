CREATE OR REPLACE FUNCTION public.ensure_client_ticket_form(_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT id INTO v_phase_id FROM public.phases
    WHERE project_id = _project_id AND is_ticket_inbox = true
    LIMIT 1;

  IF v_phase_id IS NULL THEN
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_max_pos FROM public.phases WHERE project_id = _project_id;
    INSERT INTO public.phases (project_id, name, order_index, is_ticket_inbox)
    VALUES (_project_id, 'Tickets', v_max_pos, true)
    RETURNING id INTO v_phase_id;
  END IF;

  LOOP
    v_slug := lower(substring(md5(random()::text || clock_timestamp()::text || _project_id::text), 1, 16));
    IF NOT EXISTS (SELECT 1 FROM public.client_ticket_forms WHERE slug = v_slug) THEN
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
$function$;