import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { wsBySlugQO } from "@/lib/api/tasko.queries";
import { RouteError } from "@/components/tasko/RouteError";
import { MyTeamView } from "@/components/tasko/MyTeamView";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/my-team")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mi equipo · Riel" }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    return null;
  },
  errorComponent: RouteError,
  component: WorkspaceMyTeamPage,
});

function WorkspaceMyTeamPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  return (
    <div className="flex flex-col h-full overflow-auto">
      <MyTeamView workspaceId={ws.id} />
    </div>
  );
}
