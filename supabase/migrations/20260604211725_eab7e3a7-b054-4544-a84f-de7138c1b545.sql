
-- Backfill: admin → super_admin (owner stays as workspace creator)
UPDATE public.workspace_members SET role = 'super_admin' WHERE role = 'admin';

-- Update has_permission to include super_admin
CREATE OR REPLACE FUNCTION public.has_permission(_workspace_id uuid, _user_id uuid, _perm public.workspace_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    LEFT JOIN public.role_templates rt ON rt.id = wm.role_template_id
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _user_id
      AND (
        wm.role IN ('owner','admin','super_admin')
        OR _perm = ANY(COALESCE(rt.permissions, ARRAY[]::public.workspace_permission[]))
        OR _perm = ANY(wm.extra_permissions)
      )
  )
$function$;

-- Update list_my_permissions to include super_admin
CREATE OR REPLACE FUNCTION public.list_my_permissions(_workspace_id uuid)
RETURNS public.workspace_permission[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF wm_role IN ('owner','admin','super_admin') THEN
    SELECT array_agg(e ORDER BY e) INTO all_perms
      FROM unnest(enum_range(NULL::public.workspace_permission)) e;
    RETURN all_perms;
  END IF;

  RETURN (
    SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::public.workspace_permission[])
    FROM unnest(tpl || extras) p
  );
END;
$function$;
