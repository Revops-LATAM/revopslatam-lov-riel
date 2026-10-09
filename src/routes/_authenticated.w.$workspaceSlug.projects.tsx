import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { wsBySlugQO } from "@/lib/api/tasko.queries";
import { ProjectTree } from "@/components/tasko/tree/ProjectTree";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/projects")({
  ssr: false,
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    return null;
  },
  errorComponent: RouteError,
  component: ProjectsLayout,
});

function ProjectsLayout() {
  return <Outlet />;
}
