REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, uuid, public.workspace_permission) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_task(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;