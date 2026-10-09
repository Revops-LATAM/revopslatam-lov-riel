
DO $$
DECLARE
  v_contract uuid := '8d58b6e2-4662-4931-8cd8-a908b4c01d35';
  v_ws uuid := 'd90e7950-0e6f-497e-a4c7-4b73a29a69c2';
  v_creator uuid := 'a30da03f-dcab-4e59-a0c5-973832a8c561';
  i int;
  s_start date;
  s_end date;
  v_year int;
  v_month int;
BEGIN
  -- Handoff
  INSERT INTO public.contract_handoffs (contract_id, workspace_id, state, completado_at, notas)
  VALUES (v_contract, v_ws, 'completado', now(), 'Handoff automático tras import Wrike')
  ON CONFLICT (contract_id) DO UPDATE SET state='completado', completado_at=EXCLUDED.completado_at;

  -- Sprints
  FOR i IN 1..12 LOOP
    v_month := ((3 + i - 1 - 1) % 12) + 1;
    v_year := 2026 + ((3 + i - 1 - 1) / 12);
    s_start := make_date(v_year, v_month, 1);
    s_end := (s_start + interval '1 month - 1 day')::date;
    IF i = 12 THEN s_end := DATE '2027-02-27'; END IF;
    PERFORM public.upsert_sprint_raw(v_contract, i, s_start, s_end, 30, format('Wrike import - Sprint %s', i));
  END LOOP;

  -- Project
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE workspace_id=v_ws AND contract_id=v_contract AND name='Baziani - Ads 2026') THEN
    INSERT INTO public.projects (workspace_id, contract_id, name, description, color, icon, area, state,
      fecha_inicio_delivery, fecha_entrega_objetivo, first_sprint_start_date,
      horas_presupuestadas_total, created_by)
    VALUES (v_ws, v_contract, 'Baziani - Ads 2026', '[Migrado desde Wrike]', '#f97316', 'folder', 'operations', 'en_curso',
      DATE '2026-03-01', DATE '2027-02-27', DATE '2026-03-01', 360, v_creator);
  END IF;
END $$;
