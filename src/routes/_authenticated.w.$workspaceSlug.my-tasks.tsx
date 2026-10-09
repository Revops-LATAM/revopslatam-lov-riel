import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { wsBySlugQO, myTasksQO } from "@/lib/api/tasko.queries";
import { MyTasksSkeleton } from "@/components/tasko/Skeletons";
import { RouteError } from "@/components/tasko/RouteError";
import { MyTasksList } from "@/components/tasko/MyTasksList";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/my-tasks")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mis tareas · Riel" }] }),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(myTasksQO(ws.id));
    return null;
  },
  pendingComponent: () => (
    <div className="p-6 max-w-3xl">
      <MyTasksSkeleton />
    </div>
  ),
  errorComponent: RouteError,
  component: MyTasksPage,
});

function MyTasksPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: tasks } = useSuspenseQuery(myTasksQO(ws.id));
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Mis tareas</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        <MyTasksList tasks={tasks} workspaceSlug={workspaceSlug} />
      </div>
    </div>
  );
}
