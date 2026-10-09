REVOKE EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION app_private.is_workspace_member(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION app_private.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION app_private.can_access_project(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION app_private.can_edit_project(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION app_private.can_access_task(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION app_private.shares_workspace_with(uuid, uuid) FROM public, anon;