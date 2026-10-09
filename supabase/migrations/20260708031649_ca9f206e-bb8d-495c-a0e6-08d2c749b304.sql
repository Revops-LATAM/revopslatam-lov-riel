
-- ============ Helper: sumar días hábiles ==============
CREATE OR REPLACE FUNCTION public.add_business_days(_ws uuid, _start date, _days int)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d date := _start;
  remaining int := GREATEST(_days, 0);
BEGIN
  IF _start IS NULL THEN RETURN NULL; END IF;
  WHILE remaining > 0 LOOP
    d := d + 1;
    IF EXTRACT(ISODOW FROM d) < 6
       AND NOT EXISTS (
         SELECT 1 FROM public.workspace_holidays
         WHERE workspace_id = _ws AND date = d AND affects = 'all'
       )
    THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- ============ task_dependencies ==============
CREATE TABLE public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  predecessor_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  successor_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  lag_days int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (predecessor_task_id, successor_task_id),
  CHECK (predecessor_task_id <> successor_task_id)
);
CREATE INDEX idx_taskdep_project ON public.task_dependencies(project_id);
CREATE INDEX idx_taskdep_pred ON public.task_dependencies(predecessor_task_id);
CREATE INDEX idx_taskdep_succ ON public.task_dependencies(successor_task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_dependencies TO authenticated;
GRANT ALL ON public.task_dependencies TO service_role;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members can read task deps"
ON public.task_dependencies FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
  WHERE p.id = task_dependencies.project_id AND m.user_id = auth.uid()
));
CREATE POLICY "ws members can write task deps"
ON public.task_dependencies FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
  WHERE p.id = task_dependencies.project_id AND m.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects p
  JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
  WHERE p.id = task_dependencies.project_id AND m.user_id = auth.uid()
));

-- ============ Validación: mismo proyecto, contrato implementation, sin ciclos ==============
CREATE OR REPLACE FUNCTION public.validate_task_dependency()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pred_project uuid;
  succ_project uuid;
  ctype text;
  cycle_exists boolean;
BEGIN
  SELECT project_id INTO pred_project FROM public.tasks WHERE id = NEW.predecessor_task_id;
  SELECT project_id INTO succ_project FROM public.tasks WHERE id = NEW.successor_task_id;

  IF pred_project IS NULL OR succ_project IS NULL THEN
    RAISE EXCEPTION 'Tarea inexistente';
  END IF;
  IF pred_project <> succ_project THEN
    RAISE EXCEPTION 'Las tareas deben pertenecer al mismo proyecto';
  END IF;
  NEW.project_id := pred_project;

  SELECT c.type::text INTO ctype
  FROM public.projects p LEFT JOIN public.contracts c ON c.id = p.contract_id
  WHERE p.id = pred_project;
  IF ctype IS DISTINCT FROM 'implementation' THEN
    RAISE EXCEPTION 'Las dependencias solo aplican a proyectos fijos (contratos tipo implementation)';
  END IF;

  -- Detección de ciclos: buscar camino de successor -> predecessor
  WITH RECURSIVE path AS (
    SELECT successor_task_id AS node FROM public.task_dependencies
      WHERE predecessor_task_id = NEW.successor_task_id
    UNION
    SELECT d.successor_task_id
    FROM public.task_dependencies d JOIN path ON d.predecessor_task_id = path.node
  )
  SELECT EXISTS (SELECT 1 FROM path WHERE node = NEW.predecessor_task_id) INTO cycle_exists;
  IF cycle_exists THEN
    RAISE EXCEPTION 'Dependencia crearía un ciclo';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_task_dep
BEFORE INSERT OR UPDATE ON public.task_dependencies
FOR EACH ROW EXECUTE FUNCTION public.validate_task_dependency();

-- ============ phase_dependencies ==============
CREATE TABLE public.phase_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  predecessor_phase_id uuid NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  successor_phase_id uuid NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  lag_days int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (predecessor_phase_id, successor_phase_id),
  CHECK (predecessor_phase_id <> successor_phase_id)
);
CREATE INDEX idx_phasedep_project ON public.phase_dependencies(project_id);
CREATE INDEX idx_phasedep_pred ON public.phase_dependencies(predecessor_phase_id);
CREATE INDEX idx_phasedep_succ ON public.phase_dependencies(successor_phase_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phase_dependencies TO authenticated;
GRANT ALL ON public.phase_dependencies TO service_role;
ALTER TABLE public.phase_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members can read phase deps"
ON public.phase_dependencies FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
  WHERE p.id = phase_dependencies.project_id AND m.user_id = auth.uid()
));
CREATE POLICY "ws members can write phase deps"
ON public.phase_dependencies FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
  WHERE p.id = phase_dependencies.project_id AND m.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects p
  JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
  WHERE p.id = phase_dependencies.project_id AND m.user_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.validate_phase_dependency()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pred_project uuid;
  succ_project uuid;
  ctype text;
  cycle_exists boolean;
BEGIN
  SELECT project_id INTO pred_project FROM public.phases WHERE id = NEW.predecessor_phase_id;
  SELECT project_id INTO succ_project FROM public.phases WHERE id = NEW.successor_phase_id;
  IF pred_project IS NULL OR succ_project IS NULL THEN
    RAISE EXCEPTION 'Fase inexistente';
  END IF;
  IF pred_project <> succ_project THEN
    RAISE EXCEPTION 'Las fases deben pertenecer al mismo proyecto';
  END IF;
  NEW.project_id := pred_project;

  SELECT c.type::text INTO ctype
  FROM public.projects p LEFT JOIN public.contracts c ON c.id = p.contract_id
  WHERE p.id = pred_project;
  IF ctype IS DISTINCT FROM 'implementation' THEN
    RAISE EXCEPTION 'Las dependencias solo aplican a proyectos fijos';
  END IF;

  WITH RECURSIVE path AS (
    SELECT successor_phase_id AS node FROM public.phase_dependencies
      WHERE predecessor_phase_id = NEW.successor_phase_id
    UNION
    SELECT d.successor_phase_id
    FROM public.phase_dependencies d JOIN path ON d.predecessor_phase_id = path.node
  )
  SELECT EXISTS (SELECT 1 FROM path WHERE node = NEW.predecessor_phase_id) INTO cycle_exists;
  IF cycle_exists THEN
    RAISE EXCEPTION 'Dependencia crearía un ciclo';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_phase_dep
BEFORE INSERT OR UPDATE ON public.phase_dependencies
FOR EACH ROW EXECUTE FUNCTION public.validate_phase_dependency();

-- ============ Recálculo en cascada de tareas ==============
CREATE OR REPLACE FUNCTION public.recalc_task_dates(_root uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur uuid;
  queue uuid[] := ARRAY[_root];
  visited uuid[] := ARRAY[]::uuid[];
  dep record;
  pred_due date;
  succ_start date;
  succ_due date;
  new_start date;
  new_due date;
  duration int;
  ws_id uuid;
BEGIN
  WHILE array_length(queue, 1) > 0 LOOP
    cur := queue[1];
    queue := queue[2:array_length(queue,1)];
    IF cur = ANY(visited) THEN CONTINUE; END IF;
    visited := visited || cur;

    SELECT p.workspace_id INTO ws_id
    FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = cur;

    FOR dep IN
      SELECT d.successor_task_id, d.lag_days,
             pt.due_date AS pred_due,
             st.start_date AS succ_start, st.due_date AS succ_due
      FROM public.task_dependencies d
      JOIN public.tasks pt ON pt.id = d.predecessor_task_id
      JOIN public.tasks st ON st.id = d.successor_task_id
      WHERE d.predecessor_task_id = cur
    LOOP
      pred_due := dep.pred_due;
      succ_start := dep.succ_start;
      succ_due := dep.succ_due;
      IF pred_due IS NULL THEN
        queue := queue || dep.successor_task_id;
        CONTINUE;
      END IF;
      new_start := public.add_business_days(ws_id, pred_due, GREATEST(dep.lag_days, 0) + 1);
      IF succ_start IS NULL OR new_start > succ_start THEN
        IF succ_start IS NOT NULL AND succ_due IS NOT NULL THEN
          duration := (succ_due - succ_start);
        ELSE
          duration := 0;
        END IF;
        new_due := new_start + duration;
        UPDATE public.tasks
          SET start_date = new_start,
              due_date = new_due,
              updated_at = now()
          WHERE id = dep.successor_task_id;
      END IF;
      queue := queue || dep.successor_task_id;
    END LOOP;
  END LOOP;
END;
$$;

-- Trigger en tasks: al cambiar fechas, si tiene sucesoras, recalcular
CREATE OR REPLACE FUNCTION public.trg_tasks_recalc_deps()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date)
     AND EXISTS (SELECT 1 FROM public.task_dependencies WHERE predecessor_task_id = NEW.id) THEN
    PERFORM public.recalc_task_dates(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_recalc_deps
AFTER UPDATE OF start_date, due_date ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tasks_recalc_deps();

-- Al insertar una dependencia, aplicar recálculo inmediato desde el predecesor
CREATE OR REPLACE FUNCTION public.trg_taskdep_apply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_task_dates(NEW.predecessor_task_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_taskdep_apply
AFTER INSERT ON public.task_dependencies
FOR EACH ROW EXECUTE FUNCTION public.trg_taskdep_apply();

-- ============ Recálculo de fases (desplaza tareas hijas manteniendo offset) ==============
CREATE OR REPLACE FUNCTION public.recalc_phase_dates(_root uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur uuid;
  queue uuid[] := ARRAY[_root];
  visited uuid[] := ARRAY[]::uuid[];
  dep record;
  new_start date;
  shift_days int;
  ws_id uuid;
BEGIN
  WHILE array_length(queue, 1) > 0 LOOP
    cur := queue[1];
    queue := queue[2:array_length(queue,1)];
    IF cur = ANY(visited) THEN CONTINUE; END IF;
    visited := visited || cur;

    SELECT p.workspace_id INTO ws_id
    FROM public.phases ph JOIN public.projects p ON p.id = ph.project_id
    WHERE ph.id = cur;

    FOR dep IN
      SELECT d.successor_phase_id, d.lag_days,
             pp.end_date AS pred_end,
             sp.start_date AS succ_start, sp.end_date AS succ_end
      FROM public.phase_dependencies d
      JOIN public.phases pp ON pp.id = d.predecessor_phase_id
      JOIN public.phases sp ON sp.id = d.successor_phase_id
      WHERE d.predecessor_phase_id = cur
    LOOP
      IF dep.pred_end IS NULL THEN
        queue := queue || dep.successor_phase_id;
        CONTINUE;
      END IF;
      new_start := public.add_business_days(ws_id, dep.pred_end, GREATEST(dep.lag_days, 0) + 1);
      IF dep.succ_start IS NULL OR new_start > dep.succ_start THEN
        IF dep.succ_start IS NOT NULL THEN
          shift_days := (new_start - dep.succ_start);
        ELSE
          shift_days := 0;
        END IF;
        UPDATE public.phases
          SET start_date = new_start,
              end_date = CASE WHEN dep.succ_end IS NOT NULL THEN dep.succ_end + shift_days ELSE NULL END,
              updated_at = now()
          WHERE id = dep.successor_phase_id;
        -- Desplazar tareas hijas manteniendo offset
        IF shift_days <> 0 THEN
          UPDATE public.tasks
            SET start_date = start_date + shift_days,
                due_date = due_date + shift_days,
                updated_at = now()
            WHERE phase_id = dep.successor_phase_id
              AND (start_date IS NOT NULL OR due_date IS NOT NULL);
        END IF;
      END IF;
      queue := queue || dep.successor_phase_id;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_phases_recalc_deps()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND EXISTS (SELECT 1 FROM public.phase_dependencies WHERE predecessor_phase_id = NEW.id) THEN
    PERFORM public.recalc_phase_dates(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_phases_recalc_deps
AFTER UPDATE OF start_date, end_date ON public.phases
FOR EACH ROW EXECUTE FUNCTION public.trg_phases_recalc_deps();

CREATE OR REPLACE FUNCTION public.trg_phasedep_apply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_phase_dates(NEW.predecessor_phase_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_phasedep_apply
AFTER INSERT ON public.phase_dependencies
FOR EACH ROW EXECUTE FUNCTION public.trg_phasedep_apply();
