import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { wsBySlugQO } from "@/lib/api/tasko.queries";
import { RouteError } from "@/components/tasko/RouteError";
import { MyTimeView } from "@/components/tasko/MyTimeView";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/my-time")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mi tiempo · Riel" }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    return null;
  },
  errorComponent: RouteError,
  component: WorkspaceMyTimePage,
});

function WorkspaceMyTimePage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  return <MyTimeView workspaceId={ws.id} extraInvalidateKeys={[["workload", ws.id]]} />;
}
