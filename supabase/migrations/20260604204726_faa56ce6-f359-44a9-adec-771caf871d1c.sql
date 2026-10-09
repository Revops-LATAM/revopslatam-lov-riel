
-- 1. Permissions enum
CREATE TYPE public.workspace_permission AS ENUM (
  'ops_view',
  'ops_manage',
  'workload_view',
  'reports_view',
  'finance_view',
  'finance_manage',
  'admin_members',
  'admin_roles',
  'admin_settings',
  'admin_capacity'
);

-- 2. role_templates table
CREATE TABLE public.role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  permissions public.workspace_permission[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_templates TO authenticated;
GRANT ALL ON public.role_templates TO service_role;

ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read templates"
  ON public.role_templates FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "owners/admins can write templates"
  ON public.role_templates FOR ALL
  TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER role_templates_updated_at
  BEFORE UPDATE ON public.role_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. workspace_members new columns
ALTER TABLE public.workspace_members
  ADD COLUMN role_template_id uuid REFERENCES public.role_templates(id) ON DELETE SET NULL,
  ADD COLUMN extra_permissions public.workspace_permission[] NOT NULL DEFAULT '{}';

-- 4. has_permission function
CREATE OR REPLACE FUNCTION public.has_permission(
  _workspace_id uuid,
  _user_id uuid,
  _perm public.workspace_permission
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    LEFT JOIN public.role_templates rt ON rt.id = wm.role_template_id
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _user_id
      AND (
        wm.role IN ('owner','admin')
        OR _perm = ANY(COALESCE(rt.permissions, ARRAY[]::public.workspace_permission[]))
        OR _perm = ANY(wm.extra_permissions)
      )
  )
$$;

-- 5. list_my_permissions for the current user
CREATE OR REPLACE FUNCTION public.list_my_permissions(_workspace_id uuid)
RETURNS public.workspace_permission[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  wm_role public.workspace_role;
  tpl public.workspace_permission[];
  extras public.workspace_permission[];
  all_perms public.workspace_permission[];
BEGIN
  IF uid IS NULL THEN RETURN ARRAY[]::public.workspace_permission[]; END IF;

  SELECT wm.role,
         COALESCE(rt.permissions, ARRAY[]::public.workspace_permission[]),
         wm.extra_permissions
    INTO wm_role, tpl, extras
    FROM public.workspace_members wm
    LEFT JOIN public.role_templates rt ON rt.id = wm.role_template_id
    WHERE wm.workspace_id = _workspace_id AND wm.user_id = uid;

  IF NOT FOUND THEN RETURN ARRAY[]::public.workspace_permission[]; END IF;

  IF wm_role IN ('owner','admin') THEN
    SELECT array_agg(e ORDER BY e) INTO all_perms
      FROM unnest(enum_range(NULL::public.workspace_permission)) e;
    RETURN all_perms;
  END IF;

  RETURN (
    SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::public.workspace_permission[])
    FROM unnest(tpl || extras) p
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, public.workspace_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_permissions(uuid) TO authenticated;

-- 6. Seed system templates per workspace (insert function + trigger + backfill)
CREATE OR REPLACE FUNCTION public.seed_workspace_role_templates(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.role_templates (workspace_id, name, description, permissions, is_system)
  VALUES
    (_workspace_id, 'Admin completo',
     'Acceso total al workspace.',
     ARRAY['ops_view','ops_manage','workload_view','reports_view','finance_view','finance_manage','admin_members','admin_roles','admin_settings','admin_capacity']::public.workspace_permission[],
     true),
    (_workspace_id, 'Lead operativo',
     'Gestiona clientes, contratos, sprints, fases y ve reportes.',
     ARRAY['ops_view','ops_manage','workload_view','reports_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Operador',
     'Acceso a tareas operativas y carga de trabajo (sin gestionar contratos).',
     ARRAY['ops_view','workload_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Finanzas',
     'Acceso a finanzas y reportes, sin tocar operaciones.',
     ARRAY['finance_view','finance_manage','reports_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Solo lectura',
     'Solo ver: operaciones, carga y reportes.',
     ARRAY['ops_view','workload_view','reports_view']::public.workspace_permission[],
     true)
  ON CONFLICT (workspace_id, name) DO NOTHING;
END;
$$;

-- Backfill existing workspaces
DO $$
DECLARE w record;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_workspace_role_templates(w.id);
  END LOOP;
END $$;

-- Trigger on new workspaces
CREATE OR REPLACE FUNCTION public.handle_new_workspace_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_workspace_role_templates(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_templates_on_new_workspace
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_templates();

-- 7. Assign 'Operador' template to existing 'member' rows that have none
UPDATE public.workspace_members wm
SET role_template_id = rt.id
FROM public.role_templates rt
WHERE wm.role_template_id IS NULL
  AND wm.role = 'member'
  AND rt.workspace_id = wm.workspace_id
  AND rt.name = 'Operador'
  AND rt.is_system = true;
