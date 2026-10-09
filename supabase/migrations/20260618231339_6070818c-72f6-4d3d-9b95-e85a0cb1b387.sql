-- =====================================================================
-- 1) Tabla de categorías de proyectos internos
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.internal_project_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL,
  name         text NOT NULL,
  icon         text,
  color        text,
  sort_order   int  NOT NULL DEFAULT 100,
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_project_categories TO authenticated;
GRANT ALL ON public.internal_project_categories TO service_role;

ALTER TABLE public.internal_project_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read internal categories"
  ON public.internal_project_categories
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "managers write internal categories"
  ON public.internal_project_categories
  FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'internal_manage'::public.workspace_permission))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'internal_manage'::public.workspace_permission));

CREATE TRIGGER trg_internal_categories_updated_at
  BEFORE UPDATE ON public.internal_project_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 2) Columna en projects + validación
-- =====================================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS internal_category_id uuid
  REFERENCES public.internal_project_categories(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.validate_internal_project_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.area = 'internal' THEN
    IF NEW.internal_category_id IS NULL THEN
      RAISE EXCEPTION 'internal projects require internal_category_id';
    END IF;
  ELSE
    NEW.internal_category_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_internal_project_category ON public.projects;
CREATE TRIGGER trg_validate_internal_project_category
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_internal_project_category();

-- =====================================================================
-- 3) Permitir tareas internas sin contrato/sprint/fase
-- =====================================================================
CREATE OR REPLACE FUNCTION public.validate_task_anchors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ctype public.contract_type;
  p_area public.area;
  ph_is_inbox boolean;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT area INTO p_area FROM public.projects WHERE id = NEW.project_id;
    IF p_area IS NOT NULL THEN
      NEW.area := p_area;
    END IF;
  END IF;

  IF NEW.area IN ('marketing', 'internal') THEN
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    NEW.phase_id := NULL;
  ELSE
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'tasks in operations area require contract_id';
    END IF;
    SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF NEW.phase_id IS NOT NULL THEN
      SELECT is_ticket_inbox INTO ph_is_inbox FROM public.phases WHERE id = NEW.phase_id;
    END IF;
    IF ctype = 'implementation' AND NEW.sprint_id IS NOT NULL THEN
      RAISE EXCEPTION 'implementation contract tasks cannot have sprint_id';
    END IF;
    IF ctype = 'recurrente' AND NEW.phase_id IS NOT NULL AND COALESCE(ph_is_inbox, false) = false THEN
      RAISE EXCEPTION 'recurrente contract tasks cannot have phase_id (except ticket inbox)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- 4) Seed function + trigger para workspaces nuevos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.seed_workspace_internal_categories(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.internal_project_categories
    (workspace_id, key, name, icon, color, sort_order, is_system)
  VALUES
    (_workspace_id, 'reuniones', 'Reuniones de equipo', 'Users',       '#0ea5e9', 1, true),
    (_workspace_id, 'formacion', 'Formación',           'GraduationCap','#22c55e', 2, true),
    (_workspace_id, 'eventos',   'Eventos y comunidad', 'CalendarHeart','#f59e0b', 3, true),
    (_workspace_id, 'admin',     'Admin y procesos',    'Settings',    '#64748b', 4, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_workspace_internal_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_workspace_internal_categories(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_internal_categories ON public.workspaces;
CREATE TRIGGER trg_seed_internal_categories
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_internal_categories();

-- =====================================================================
-- 5) Backfill: workspaces existentes + permisos
-- =====================================================================
DO $$
DECLARE w_id uuid;
BEGIN
  FOR w_id IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_workspace_internal_categories(w_id);
  END LOOP;
END $$;

UPDATE public.role_templates
   SET permissions = (
     SELECT ARRAY(
       SELECT DISTINCT unnest(
         permissions || ARRAY['internal_view','internal_manage']::public.workspace_permission[]
       )
     )
   )
 WHERE is_system = true AND name = 'Admin completo';

-- Re-define seed_workspace_role_templates so future workspaces include internal perms
CREATE OR REPLACE FUNCTION public.seed_workspace_role_templates(_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.role_templates (workspace_id, name, description, permissions, is_system)
  VALUES
    (_workspace_id, 'Admin completo',
     'Acceso total al workspace.',
     ARRAY['ops_view','ops_manage','workload_view','reports_view','finance_view','finance_manage','marketing_view','marketing_manage','internal_view','internal_manage','admin_members','admin_roles','admin_settings','admin_capacity']::public.workspace_permission[],
     true),
    (_workspace_id, 'Lead operativo',
     'Gestiona clientes, contratos, sprints, fases y ve reportes.',
     ARRAY['ops_view','ops_manage','workload_view','reports_view','internal_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Operador',
     'Acceso a tareas operativas y carga de trabajo (sin gestionar contratos).',
     ARRAY['ops_view','workload_view','internal_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Finanzas',
     'Acceso a finanzas y reportes, sin tocar operaciones.',
     ARRAY['finance_view','finance_manage','reports_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Marketing',
     'Acceso al espacio Marketing (proyectos y tareas internas).',
     ARRAY['marketing_view','marketing_manage']::public.workspace_permission[],
     true),
    (_workspace_id, 'Solo lectura',
     'Solo ver: operaciones, carga y reportes.',
     ARRAY['ops_view','workload_view','reports_view','internal_view']::public.workspace_permission[],
     true)
  ON CONFLICT (workspace_id, name) DO NOTHING;
END;
$function$;

-- Para que "Lead operativo", "Operador" y "Solo lectura" existentes vean Internal
UPDATE public.role_templates
   SET permissions = (
     SELECT ARRAY(
       SELECT DISTINCT unnest(permissions || ARRAY['internal_view']::public.workspace_permission[])
     )
   )
 WHERE is_system = true
   AND name IN ('Lead operativo','Operador','Solo lectura');

-- =====================================================================
-- 6) Toggle: contar horas internas en carga
-- =====================================================================
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS internal_counts_in_workload boolean NOT NULL DEFAULT true;