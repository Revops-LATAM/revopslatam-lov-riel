-- Fase 1: tipos de tarea y estados configurables

CREATE TABLE public.task_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'CheckSquare',
  color text NOT NULL DEFAULT '#64748b',
  is_system boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_types TO authenticated;
GRANT ALL ON public.task_types TO service_role;
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read task_types" ON public.task_types
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins write task_types" ON public.task_types
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER trg_task_types_updated_at BEFORE UPDATE ON public.task_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Categorías de estado (lógica interna)
CREATE TYPE public.task_status_category AS ENUM ('abierta','en_progreso','bloqueada','completada','cancelada');

CREATE TABLE public.task_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_type_id uuid NOT NULL REFERENCES public.task_types(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#94a3b8',
  category public.task_status_category NOT NULL DEFAULT 'abierta',
  is_system boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, task_type_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_statuses TO authenticated;
GRANT ALL ON public.task_statuses TO service_role;
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read task_statuses" ON public.task_statuses
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins write task_statuses" ON public.task_statuses
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]));

CREATE TRIGGER trg_task_statuses_updated_at BEFORE UPDATE ON public.task_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_task_statuses_type ON public.task_statuses(task_type_id, sort_order);

-- Seed por workspace
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
  VALUES (_workspace_id, 'tarea', 'Tarea', 'CheckSquare', '#3b82f6', true, 1)
  ON CONFLICT (workspace_id, key) DO UPDATE SET name=EXCLUDED.name
  RETURNING id INTO v_tarea;

  INSERT INTO public.task_types(workspace_id, key, name, icon, color, is_system, sort_order)
  VALUES (_workspace_id, 'ticket', 'Ticket', 'LifeBuoy', '#f97316', true, 2)
  ON CONFLICT (workspace_id, key) DO UPDATE SET name=EXCLUDED.name
  RETURNING id INTO v_ticket;

  INSERT INTO public.task_types(workspace_id, key, name, icon, color, is_system, sort_order)
  VALUES (_workspace_id, 'reunion', 'Reunión', 'Calendar', '#8b5cf6', true, 3)
  ON CONFLICT (workspace_id, key) DO UPDATE SET name=EXCLUDED.name
  RETURNING id INTO v_reunion;

  -- Estados TAREA (mapean a enum existente cuando aplica)
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

-- Seed para workspaces existentes
DO $$
DECLARE w record;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_workspace_task_types(w.id);
  END LOOP;
END $$;

-- Auto-seed para nuevos workspaces
CREATE OR REPLACE FUNCTION public.handle_new_workspace_task_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_workspace_task_types(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspace_seed_task_types
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_task_types();

-- Columnas en tasks (nullable inicialmente, se llenan vía backfill)
ALTER TABLE public.tasks
  ADD COLUMN task_type_id uuid REFERENCES public.task_types(id),
  ADD COLUMN status_id uuid REFERENCES public.task_statuses(id);

CREATE INDEX idx_tasks_status_id ON public.tasks(status_id);
CREATE INDEX idx_tasks_task_type_id ON public.tasks(task_type_id);

-- Backfill: cada tarea → tipo "tarea" del workspace de su proyecto, mapear status enum → status_id
WITH task_ws AS (
  SELECT t.id AS task_id, p.workspace_id, t.status::text AS status_key
    FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
)
UPDATE public.tasks t
   SET task_type_id = tt.id,
       status_id    = ts.id
  FROM task_ws tw
  JOIN public.task_types tt ON tt.workspace_id = tw.workspace_id AND tt.key = 'tarea'
  LEFT JOIN public.task_statuses ts
         ON ts.workspace_id = tw.workspace_id AND ts.task_type_id = tt.id AND ts.key = tw.status_key
 WHERE t.id = tw.task_id;

-- Si algún status del enum no tuvo match, usar el default del tipo
UPDATE public.tasks t
   SET status_id = ts.id
  FROM public.task_statuses ts
 WHERE t.status_id IS NULL
   AND ts.task_type_id = t.task_type_id
   AND ts.is_default = true;
