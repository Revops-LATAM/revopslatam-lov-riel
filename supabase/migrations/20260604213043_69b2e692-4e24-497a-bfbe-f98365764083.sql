GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, public.workspace_permission) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_my_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_task(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;