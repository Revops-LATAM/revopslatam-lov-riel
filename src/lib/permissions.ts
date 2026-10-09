import { useQuery } from "@tanstack/react-query";
import { myPermissionsQO } from "@/lib/api/tasko.queries";
import type { WorkspacePermission } from "@/lib/api/permissions.functions";

export function usePermissions(workspaceId: string | undefined) {
  const q = useQuery({
    ...myPermissionsQO(workspaceId ?? ""),
    enabled: !!workspaceId,
  });
  const perms = q.data ?? [];
  const set = new Set<WorkspacePermission>(perms as WorkspacePermission[]);
  return {
    isLoading: q.isLoading,
    permissions: perms as WorkspacePermission[],
    has: (p: WorkspacePermission) => set.has(p),
    hasAny: (ps: WorkspacePermission[]) => ps.some((p) => set.has(p)),
  };
}
