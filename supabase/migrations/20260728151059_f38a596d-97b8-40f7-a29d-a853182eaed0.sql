CREATE OR REPLACE FUNCTION app_private.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles workspace_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND (role = ANY(_roles) OR role = 'super_admin'::workspace_role)
  )
$$;