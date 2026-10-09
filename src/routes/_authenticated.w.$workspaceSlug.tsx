import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { workspacesQO } from "@/lib/api/tasko.queries";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug")({
  ssr: false,
  beforeLoad: async ({ context, params }) => {
    const workspaces = await context.queryClient.ensureQueryData(workspacesQO());

    if (workspaces.length === 0) return;

    const exists = workspaces.some((workspace) => workspace.slug === params.workspaceSlug);
    if (!exists) {
      throw redirect({
        to: "/w/$workspaceSlug",
        params: { workspaceSlug: workspaces[0].slug },
        replace: true,
      });
    }
  },
  component: () => <Outlet />,
});