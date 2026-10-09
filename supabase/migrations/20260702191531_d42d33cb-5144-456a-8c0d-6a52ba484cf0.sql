
-- 1) Reemplazar la función de seed con los nuevos íconos y actualizar ícono en conflicto.
CREATE OR REPLACE FUNCTION public.seed_workspace_task_types(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tarea uuid;
  v_ticket uuid;
  v_reunion uuid;
BEGIN
  INSERT INTO public.task_types(workspace_id, key, name, icon, color, is_system, sort_order)
  VALUES (_workspace_id, 'tarea', 'Tarea', 'NotebookPen', '#3b82f6', true, 1)
  ON CONFLICT (workspace_id, key) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon
  RETURNING id INTO v_tarea;

  INSERT INTO public.task_types(workspace_id, key, name, icon, color, is_system, sort_order)
  VALUES (_workspace_id, 'ticket', 'Ticket', 'Headset', '#f97316', true, 2)
  ON CONFLICT (workspace_id, key) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon
  RETURNING id INTO v_ticket;

  INSERT INTO public.task_types(workspace_id, key, name, icon, color, is_system, sort_order)
  VALUES (_workspace_id, 'reunion', 'Reunión', 'Calendar', '#8b5cf6', true, 3)
  ON CONFLICT (workspace_id, key) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon
  RETURNING id INTO v_reunion;

  -- Estados TAREA
  INSERT INTO public.task_statuses(workspace_id, task_type_id, key, name, color, category, is_system, is_default, sort_order) VALUES
    (_workspace_id, v_tarea, 'nueva',            'Nueva',           '#94a3b8', 'abierta',     true, true,  1),
    (_workspace_id, v_tarea, 'planificada',      'Planificada',     '#0ea5e9', 'abierta',     true, false, 2),
    (_workspace_id, v_tarea, 'en_curso',         'En curso',        '#3b82f6', 'en_progreso', true, false, 3),
    (_workspace_id, v_tarea, 'revision_interna', 'Revisión interna','#8b5cf6', 'en_progreso', true, false, 4),
    (_workspace_id, v_tarea, 'revision_cliente', 'Revisión cliente','#a855f7', 'en_progreso', true, false, 5),
    (_workspace_id, v_tarea, 'en_correccion',    'En corrección',   '#f59e0b', 'en_progreso', true, false, 6),
    (_workspace_id, v_tarea, 'en_pausa',         'En pausa',        '#64748b', 'bloqueada',   true, false, 7),
    (_workspace_id, v_tarea, 'demorada',         'Demorada',        '#ef4444', 'bloqueada',   true, false, 8),
    (_workspace_id, v_tarea, 'completada',       'Completada',      '#22c55e', 'completada',  true, false, 9),
    (_workspace_id, v_tarea, 'cancelada',        'Cancelada',       '#71717a', 'cancelada',   true, false, 10)
  ON CONFLICT (workspace_id, task_type_id, key) DO NOTHING;

  -- Estados TICKET
  INSERT INTO public.task_statuses(workspace_id, task_type_id, key, name, color, category, is_system, is_default, sort_order) VALUES
    (_workspace_id, v_ticket, 'abierto',           'Abierto',           '#f97316', 'abierta',     true, true,  1),
    (_workspace_id, v_ticket, 'en_progreso',       'En progreso',       '#3b82f6', 'en_progreso', true, false, 2),
    (_workspace_id, v_ticket, 'espera_cliente',    'Espera de cliente', '#eab308', 'bloqueada',   true, false, 3),
    (_workspace_id, v_ticket, 'resuelto',          'Resuelto',          '#22c55e', 'completada',  true, false, 4),
    (_workspace_id, v_ticket, 'cerrado',           'Cerrado',           '#16a34a', 'completada',  true, false, 5),
    (_workspace_id, v_ticket, 'cancelado',         'Cancelado',         '#71717a', 'cancelada',   true, false, 6)
  ON CONFLICT (workspace_id, task_type_id, key) DO NOTHING;

  -- Estados REUNION
  INSERT INTO public.task_statuses(workspace_id, task_type_id, key, name, color, category, is_system, is_default, sort_order) VALUES
    (_workspace_id, v_reunion, 'agendada',     'Agendada',     '#8b5cf6', 'abierta',     true, true,  1),
    (_workspace_id, v_reunion, 'confirmada',   'Confirmada',   '#3b82f6', 'abierta',     true, false, 2),
    (_workspace_id, v_reunion, 'realizada',    'Realizada',    '#22c55e', 'completada',  true, false, 3),
    (_workspace_id, v_reunion, 'no_realizada', 'No realizada', '#ef4444', 'cancelada',   true, false, 4),
    (_workspace_id, v_reunion, 'cancelada',    'Cancelada',    '#71717a', 'cancelada',   true, false, 5)
  ON CONFLICT (workspace_id, task_type_id, key) DO NOTHING;
END;
$$;

-- 2) Backfill de filas existentes: Tarea -> NotebookPen, Ticket -> Headset.
UPDATE public.task_types SET icon = 'NotebookPen' WHERE key = 'tarea' AND icon <> 'NotebookPen';
UPDATE public.task_types SET icon = 'Headset'     WHERE key = 'ticket' AND icon <> 'Headset';
