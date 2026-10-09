
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(UUID, UUID, public.workspace_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_project(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_task(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, UUID, public.workspace_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_task(UUID, UUID) TO authenticated;

-- Fix search_path on trigger helpers
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_task_completion() SET search_path = public;
