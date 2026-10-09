
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
     ARRAY['ops_view','ops_manage','workload_view','reports_view','finance_view','finance_manage','marketing_view','marketing_manage','admin_members','admin_roles','admin_settings','admin_capacity']::public.workspace_permission[],
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
    (_workspace_id, 'Marketing',
     'Acceso al espacio Marketing (proyectos y tareas internas).',
     ARRAY['marketing_view','marketing_manage']::public.workspace_permission[],
     true),
    (_workspace_id, 'Solo lectura',
     'Solo ver: operaciones, carga y reportes.',
     ARRAY['ops_view','workload_view','reports_view']::public.workspace_permission[],
     true)
  ON CONFLICT (workspace_id, name) DO NOTHING;
END;
$function$;

UPDATE public.role_templates
   SET permissions = permissions || ARRAY['marketing_view','marketing_manage']::public.workspace_permission[]
 WHERE name = 'Admin completo'
   AND is_system = true
   AND NOT ('marketing_view'::public.workspace_permission = ANY(permissions));
