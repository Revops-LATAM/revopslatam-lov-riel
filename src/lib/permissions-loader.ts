import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { myPermissionsQO, wsBySlugQO } from "@/lib/api/tasko.queries";
import type { WorkspacePermission } from "@/lib/api/permissions.functions";

/**
 * Loader helper: ensure the current user has at least one of the given
 * permissions in the workspace, otherwise redirect to the workspace home.
 * Use inside route loaders (not beforeLoad — needs SSR-off + auth).
 */
export async function requirePermission(
  queryClient: QueryClient,
  workspaceSlug: string,
  perms: WorkspacePermission | WorkspacePermission[],
) {
  const ws = await queryClient.ensureQueryData(wsBySlugQO(workspaceSlug));
  const granted = await queryClient.ensureQueryData(myPermissionsQO(ws.id));
  const need = Array.isArray(perms) ? perms : [perms];
  const set = new Set(granted);
  const ok = need.some((p) => set.has(p));
  if (!ok) {
    throw redirect({
      to: "/w/$workspaceSlug",
      params: { workspaceSlug: ws.slug },
      replace: true,
    });
  }
  return ws;
}
