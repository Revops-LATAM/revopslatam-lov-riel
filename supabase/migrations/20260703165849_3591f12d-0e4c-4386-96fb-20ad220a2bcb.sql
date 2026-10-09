
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
     ARRAY['finance_view','finance_manage','reports_view','internal_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Marketing y Ventas',
     'Acceso exclusivo al espacio de Marketing y Ventas. No ve Operaciones ni Finanzas.',
     ARRAY['marketing_view','marketing_manage','internal_view']::public.workspace_permission[],
     true),
    (_workspace_id, 'Solo lectura',
     'Solo ver: operaciones, carga y reportes.',
     ARRAY['ops_view','workload_view','reports_view','internal_view']::public.workspace_permission[],
     true)
  ON CONFLICT (workspace_id, name) DO NOTHING;
END;
$function$;

-- Rename existing "Marketing" system templates to "Marketing y Ventas" and lock permissions to marketing-only + internal
UPDATE public.role_templates
   SET name = 'Marketing y Ventas',
       description = 'Acceso exclusivo al espacio de Marketing y Ventas. No ve Operaciones ni Finanzas.',
       permissions = ARRAY['marketing_view','marketing_manage','internal_view']::public.workspace_permission[]
 WHERE is_system = true
   AND name = 'Marketing'
   AND NOT EXISTS (
     SELECT 1 FROM public.role_templates rt2
      WHERE rt2.workspace_id = role_templates.workspace_id
        AND rt2.name = 'Marketing y Ventas'
   );

-- Ensure internal_view is granted to every existing system template so Interno is visible for all
UPDATE public.role_templates
   SET permissions = permissions || ARRAY['internal_view']::public.workspace_permission[]
 WHERE is_system = true
   AND NOT ('internal_view'::public.workspace_permission = ANY(permissions));

-- Ensure Admin completo also has internal_manage
UPDATE public.role_templates
   SET permissions = permissions || ARRAY['internal_manage']::public.workspace_permission[]
 WHERE is_system = true
   AND name = 'Admin completo'
   AND NOT ('internal_manage'::public.workspace_permission = ANY(permissions));

-- Seed the new template into workspaces that were seeded before it existed
DO $$
DECLARE w record;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_workspace_role_templates(w.id);
  END LOOP;
END $$;
